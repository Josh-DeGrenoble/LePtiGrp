-- LePtiGrp - Calendrier (4e outil du menu ▽) : événements à une date, partagés comme les autres outils
-- (moi seul / une conv / avec des amis), chacun répond « je viens » ou « je ne viens pas ».
-- À lancer après tools.sql, activity.sql et push.sql (relançable sans risque), puis security.sql.

create table if not exists public.events (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null default auth.uid() references public.profiles on delete cascade,
  conversation_id uuid references public.conversations on delete cascade,
  participants    uuid[] not null default array[auth.uid()],
  title           text not null check (char_length(title) between 1 and 100),
  day             date not null,
  at_time         time,                                   -- heure (facultative)
  place           text check (char_length(place) <= 100), -- lieu (facultatif)
  created_at      timestamptz not null default now()
);
create index if not exists events_conv_idx on public.events (conversation_id);
create index if not exists events_day_idx on public.events (day);

create table if not exists public.event_replies (
  event_id uuid not null references public.events on delete cascade,
  user_id  uuid not null default auth.uid() references public.profiles on delete cascade,
  going    boolean not null,
  at       timestamptz not null default now(),
  primary key (event_id, user_id)
);

-- ---------- Accès (RLS), comme les autres outils ----------------------
create or replace function public.can_access_event(e uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select tool_access(conversation_id, participants) from events where id = e), false)
$$;

alter table public.events enable row level security;
drop policy if exists "events read" on public.events;
create policy "events read" on public.events for select to authenticated using (public.tool_access(conversation_id, participants));
drop policy if exists "events create" on public.events;
create policy "events create" on public.events for insert to authenticated with check (public.tool_create_ok(owner_id, conversation_id, participants));
drop policy if exists "events edit" on public.events;
create policy "events edit" on public.events for update to authenticated using (public.tool_access(conversation_id, participants)) with check (public.tool_access(conversation_id, participants));
drop policy if exists "events delete" on public.events;
create policy "events delete" on public.events for delete to authenticated using (public.tool_access(conversation_id, participants));
grant select, insert, delete on public.events to authenticated;
revoke update on public.events from authenticated;
grant update (title, day, at_time, place) on public.events to authenticated;

alter table public.event_replies enable row level security;
drop policy if exists "replies read" on public.event_replies;
create policy "replies read" on public.event_replies for select to authenticated using (public.can_access_event(event_id));
drop policy if exists "replies mine" on public.event_replies;
create policy "replies mine" on public.event_replies for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.can_access_event(event_id));
grant select, insert, update, delete on public.event_replies to authenticated;

do $$ begin
  begin alter publication supabase_realtime add table public.events; exception when others then null; end;
  begin alter publication supabase_realtime add table public.event_replies; exception when others then null; end;
end $$;

-- ---------- Activité dans le chat (outil 'event') ---------------------
alter table public.messages drop constraint if exists messages_tool_check;
alter table public.messages add constraint messages_tool_check check (tool in ('list', 'ledger', 'poll', 'event'));

-- Les notifs d'activité du calendrier sont activées par défaut (une seule fois : ne réactive pas un choix de l'utilisateur)
do $$ begin
  if pg_get_expr((select adbin from pg_attrdef d join pg_attribute a on a.attrelid = d.adrelid and a.attnum = d.adnum
                   where d.adrelid = 'public.profiles'::regclass and a.attname = 'notify_tools_default'), 'public.profiles'::regclass) not like '%event%' then
    alter table public.profiles alter column notify_tools_default set default '{list,poll,ledger,event}';
    update public.profiles set notify_tools_default = notify_tools_default || '{event}' where not ('event' = any(notify_tools_default));
    update public.members set notify_tools = notify_tools || '{event}' where notify_tools is not null and not ('event' = any(notify_tools));
  end if;
end $$;

create or replace function public.fmt_day(d date, t time)
returns text language sql immutable as $$
  select (array['dim.','lun.','mar.','mer.','jeu.','ven.','sam.'])[extract(dow from d)::int + 1] || ' ' || to_char(d, 'FMDD/MM')
         || coalesce(' à ' || replace(to_char(t, 'FMHH24"h"MI'), 'h00', 'h'), '')
$$;

create or replace function public.activity_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.conversation_id is null then return null; end if;
  if tg_op = 'INSERT' then
    perform log_activity(new.conversation_id, 'event', new.id, new.title, '📅 ' || fmt_day(new.day, new.at_time) || coalesce(' · ' || nullif(new.place, ''), ''));
  elsif (new.day, new.at_time, new.title, new.place) is distinct from (old.day, old.at_time, old.title, old.place) then
    perform log_activity(new.conversation_id, 'event', new.id, new.title, '✎ ' || fmt_day(new.day, new.at_time) || coalesce(' · ' || nullif(new.place, ''), ''));
  end if;
  return null;
end $$;
drop trigger if exists on_event_activity on public.events;
create trigger on_event_activity after insert or update of title, day, at_time, place on public.events
  for each row execute function public.activity_event();

create or replace function public.activity_event_reply()
returns trigger language plpgsql security definer set search_path = public as $$
declare e events;
begin
  select * into e from events where id = coalesce(new.event_id, old.event_id);
  if e.conversation_id is null then return null; end if;
  if tg_op = 'UPDATE' and new.going = old.going then return null; end if;
  perform log_activity(e.conversation_id, 'event', e.id, e.title, case
    when tg_op = 'DELETE' then 'n''a plus répondu'
    when new.going then '✓ vient'
    else '✗ ne vient pas' end);
  return null;
end $$;
drop trigger if exists on_event_reply_activity on public.event_replies;
create trigger on_event_reply_activity after insert or update or delete on public.event_replies
  for each row execute function public.activity_event_reply();

-- ---------- Invitation « avec des amis » : notif aux invités ----------
create or replace function public.notify_event_invite()
returns trigger language plpgsql security definer set search_path = public as $$
declare secret text;
begin
  if new.conversation_id is not null or cardinality(new.participants) < 2 then return null; end if;
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'push_secret';
  if secret is null then return null; end if;
  perform net.http_post(
    url := 'https://jsxwhyhriyeizlnmiknf.supabase.co/functions/v1/push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', secret),
    body := jsonb_build_object('event', 'invite', 'event_id', new.id));
  return null;
end $$;
drop trigger if exists on_event_invite on public.events;
create trigger on_event_invite after insert on public.events
  for each row execute function public.notify_event_invite();

revoke all on function public.activity_event(), public.activity_event_reply(), public.notify_event_invite() from public, anon, authenticated;
