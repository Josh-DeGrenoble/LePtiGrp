-- =====================================================================
-- LePtiGrp - outils du menu ▽ : pense-bêtes, comptes, sondages, rappels
-- Prérequis : schema.sql, permissions.sql, push.sql (+ secret "push_secret"), extension pg_cron activée.
-- Peut être relancé sans risque.
--
-- Partage commun aux trois outils :
--   * pour moi seul : conversation_id null, participants = {moi}
--   * pour une conv : conversation_id = la conv (tous ses membres y ont accès)
--   * libre         : conversation_id null, participants = {moi + amis choisis}
-- =====================================================================

create or replace function public.tool_access(conv uuid, participants uuid[])
returns boolean language sql stable security definer set search_path = public as $$
  select case when conv is null then auth.uid() = any(participants) else is_member(conv) end
$$;

-- À la création : je fais partie des participants, qui sont tous mes amis ; ou je suis membre de la conv
create or replace function public.tool_create_ok(owner uuid, conv uuid, participants uuid[])
returns boolean language sql stable security definer set search_path = public as $$
  select owner = auth.uid() and case
    when conv is not null then is_member(conv)
    else auth.uid() = any(participants)
      and coalesce((select bool_and(p = auth.uid() or is_friend(p)) from unnest(participants) p), false)
  end
$$;

-- ---------- Pense-bêtes ----------------------------------------------
create table if not exists public.lists (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null default auth.uid() references public.profiles on delete cascade,
  conversation_id uuid references public.conversations on delete cascade,
  name            text not null check (char_length(name) between 1 and 40),
  created_at      timestamptz not null default now()
);
alter table public.lists add column if not exists participants uuid[] not null default '{}';
update public.lists set participants = array[owner_id] where participants = '{}';
alter table public.lists alter column participants set default array[auth.uid()];
create index if not exists lists_conv_idx on public.lists (conversation_id);

create table if not exists public.list_items (
  id         bigint generated always as identity primary key,
  list_id    uuid not null references public.lists on delete cascade,
  content    text not null check (char_length(content) between 1 and 100),
  quantity   text check (char_length(quantity) <= 20),
  checked    boolean not null default false,
  created_by uuid default auth.uid() references public.profiles on delete set null,
  created_at timestamptz not null default now()
);
alter table public.list_items add column if not exists checked_by uuid references public.profiles on delete set null;
create index if not exists list_items_list_idx on public.list_items (list_id);

-- Qui a coché : rempli automatiquement
create or replace function public.set_checked_by()
returns trigger language plpgsql as $$
begin
  if new.checked is distinct from old.checked then
    new.checked_by := case when new.checked then auth.uid() end;
  end if;
  return new;
end $$;
drop trigger if exists on_item_check on public.list_items;
create trigger on_item_check before update of checked on public.list_items
  for each row execute function public.set_checked_by();

-- ---------- Comptes --------------------------------------------------
create table if not exists public.ledgers (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null default auth.uid() references public.profiles on delete cascade,
  conversation_id uuid references public.conversations on delete cascade,
  participants    uuid[] not null default array[auth.uid()],
  name            text not null check (char_length(name) between 1 and 40),
  created_at      timestamptz not null default now()
);
create index if not exists ledgers_conv_idx on public.ledgers (conversation_id);

create table if not exists public.expenses (
  id         bigint generated always as identity primary key,
  ledger_id  uuid not null references public.ledgers on delete cascade,
  label      text not null check (char_length(label) between 1 and 60),
  amount     numeric(12, 2) not null check (amount > 0),
  paid_by    uuid not null references public.profiles on delete cascade,
  split      uuid[] not null check (cardinality(split) > 0),  -- entre qui la dépense est partagée
  created_by uuid default auth.uid() references public.profiles on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists expenses_ledger_idx on public.expenses (ledger_id);

-- ---------- Sondages -------------------------------------------------
create table if not exists public.polls (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null default auth.uid() references public.profiles on delete cascade,
  conversation_id uuid references public.conversations on delete cascade,
  participants    uuid[] not null default array[auth.uid()],
  question        text not null check (char_length(question) between 1 and 200),
  options         text[] not null check (cardinality(options) between 2 and 31),
  multiple        boolean not null default false,  -- plusieurs réponses possibles
  created_at      timestamptz not null default now()
);
create index if not exists polls_conv_idx on public.polls (conversation_id);

create table if not exists public.poll_votes (
  poll_id uuid not null references public.polls on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  option  smallint not null,
  primary key (poll_id, user_id, option)
);

-- Jusqu'à 31 réponses (sondage de dates sur un mois)
alter table public.polls drop constraint if exists polls_options_check;
alter table public.polls add constraint polls_options_check check (cardinality(options) between 2 and 31);

-- Un sondage créé pour une conv apparaît aussi comme message votable dans le chat
alter table public.messages add column if not exists poll_id uuid references public.polls on delete cascade;

-- ---------- Accès (RLS) ----------------------------------------------
create or replace function public.can_access_list(l uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select tool_access(conversation_id, participants) from lists where id = l), false)
$$;
create or replace function public.can_access_ledger(l uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select tool_access(conversation_id, participants) from ledgers where id = l), false)
$$;
create or replace function public.can_access_poll(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select tool_access(conversation_id, participants) from polls where id = p), false)
$$;

do $$
declare t text;
begin
  foreach t in array array['lists', 'ledgers', 'polls'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%s read" on public.%I', t, t);
    execute format('create policy "%s read" on public.%I for select to authenticated using (public.tool_access(conversation_id, participants))', t, t);
    execute format('drop policy if exists "%s create" on public.%I', t, t);
    execute format('create policy "%s create" on public.%I for insert to authenticated with check (public.tool_create_ok(owner_id, conversation_id, participants))', t, t);
    execute format('drop policy if exists "%s edit" on public.%I', t, t);
    execute format('create policy "%s edit" on public.%I for update to authenticated using (public.tool_access(conversation_id, participants)) with check (public.tool_access(conversation_id, participants))', t, t);
    execute format('drop policy if exists "%s delete" on public.%I', t, t);
    execute format('create policy "%s delete" on public.%I for delete to authenticated using (public.tool_access(conversation_id, participants))', t, t);
  end loop;
end $$;

alter table public.list_items enable row level security;
drop policy if exists "items all" on public.list_items;
create policy "items all" on public.list_items for all to authenticated
  using (public.can_access_list(list_id)) with check (public.can_access_list(list_id));

alter table public.expenses enable row level security;
drop policy if exists "expenses all" on public.expenses;
create policy "expenses all" on public.expenses for all to authenticated
  using (public.can_access_ledger(ledger_id)) with check (public.can_access_ledger(ledger_id));

alter table public.poll_votes enable row level security;
drop policy if exists "votes read" on public.poll_votes;
create policy "votes read" on public.poll_votes for select to authenticated using (public.can_access_poll(poll_id));
drop policy if exists "votes own" on public.poll_votes;
create policy "votes own" on public.poll_votes for insert to authenticated
  with check (user_id = auth.uid() and public.can_access_poll(poll_id));
drop policy if exists "votes remove" on public.poll_votes;
create policy "votes remove" on public.poll_votes for delete to authenticated using (user_id = auth.uid());

-- Je vois le profil des gens avec qui je partage un outil (même s'ils ne sont pas mes amis)
create or replace function public.shares_tool(other uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from lists   where conversation_id is null and auth.uid() = any(participants) and other = any(participants))
      or exists (select 1 from ledgers where conversation_id is null and auth.uid() = any(participants) and other = any(participants))
      or exists (select 1 from polls   where conversation_id is null and auth.uid() = any(participants) and other = any(participants))
$$;
drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_friend(id) or public.shares_conversation(id) or public.shares_tool(id));

grant select, insert, update, delete on public.lists, public.list_items, public.ledgers, public.expenses,
  public.polls, public.poll_votes to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Mises à jour en direct
do $$
declare t text;
begin
  foreach t in array array['lists', 'list_items', 'ledgers', 'expenses', 'polls', 'poll_votes'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when duplicate_object then null;
    end;
  end loop;
end $$;

-- ---------- Rappels (notification pour soi à l'heure choisie) --------
create table if not exists public.reminders (
  id              bigint generated always as identity primary key,
  user_id         uuid not null default auth.uid() references public.profiles on delete cascade,
  conversation_id uuid references public.conversations on delete cascade,
  message         text not null check (char_length(message) between 1 and 200),
  remind_at       timestamptz not null,
  sent_at         timestamptz,
  created_at      timestamptz not null default now()
);
create index if not exists reminders_due_idx on public.reminders (remind_at) where sent_at is null;
alter table public.reminders enable row level security;
drop policy if exists "reminders own" on public.reminders;
create policy "reminders own" on public.reminders for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and (conversation_id is null or public.is_member(conversation_id)));
grant select, insert, update, delete on public.reminders to authenticated;

-- Chaque minute : s'il y a des rappels échus, la fonction "push" les envoie
create or replace function public.send_due_reminders()
returns void language plpgsql security definer set search_path = public as $$
declare secret text;
begin
  if not exists (select 1 from reminders where sent_at is null and remind_at <= now()) then return; end if;
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'push_secret';
  if secret is null then return; end if;
  perform net.http_post(
    url := 'https://jsxwhyhriyeizlnmiknf.supabase.co/functions/v1/push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', secret),
    body := jsonb_build_object('event', 'reminders')
  );
end $$;
revoke execute on function public.send_due_reminders() from public, anon, authenticated;

select cron.unschedule('send-reminders') where exists (select 1 from cron.job where jobname = 'send-reminders');
select cron.schedule('send-reminders', '* * * * *', 'select public.send_due_reminders()');
