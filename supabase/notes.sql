-- =====================================================================
-- LePtiGrp - pense-bêtes (listes) et rappels par notification
-- Prérequis : schema.sql, push.sql (et le secret "push_secret" dans le Vault).
-- =====================================================================

-- Pense-bêtes : personnels (conversation_id null) ou partagés avec une conversation
create table if not exists public.lists (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null default auth.uid() references public.profiles on delete cascade,
  conversation_id uuid references public.conversations on delete cascade,
  name            text not null check (char_length(name) between 1 and 40),
  created_at      timestamptz not null default now()
);
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
create index if not exists list_items_list_idx on public.list_items (list_id);

-- Accès : le créateur pour une liste perso, les membres de la conversation pour une liste partagée
create or replace function public.can_access_list(l uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from lists where id = l
      and (case when conversation_id is null then owner_id = auth.uid() else is_member(conversation_id) end)
  )
$$;

alter table public.lists enable row level security;
alter table public.list_items enable row level security;

drop policy if exists "lists read" on public.lists;
create policy "lists read" on public.lists for select to authenticated using (public.can_access_list(id));
drop policy if exists "lists create" on public.lists;
create policy "lists create" on public.lists for insert to authenticated
  with check (owner_id = auth.uid() and (conversation_id is null or public.is_member(conversation_id)));
drop policy if exists "lists edit" on public.lists;
create policy "lists edit" on public.lists for update to authenticated
  using (public.can_access_list(id)) with check (conversation_id is null or public.is_member(conversation_id));
drop policy if exists "lists delete" on public.lists;
create policy "lists delete" on public.lists for delete to authenticated using (public.can_access_list(id));

drop policy if exists "items all" on public.list_items;
create policy "items all" on public.list_items for all to authenticated
  using (public.can_access_list(list_id)) with check (public.can_access_list(list_id));

grant select, insert, update, delete on public.lists, public.list_items to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- Mises à jour en direct (plusieurs membres sur la même liste)
alter table public.list_items replica identity full;
do $$ begin
  alter publication supabase_realtime add table public.list_items, public.lists;
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Rappels : un message reçu en notification à l'heure choisie (pour soi seul)
-- ---------------------------------------------------------------------
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
create extension if not exists pg_cron;

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
