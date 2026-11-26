-- =====================================================================
-- LePtiGrp - avatars de groupe, retours (bugs / évolutions). Relançable sans risque.
-- Prérequis : schema.sql, random-avatar.sql.
-- =====================================================================

-- Nombre de membres de mes convs : avatar rond à 2, carré arrondi au-delà
create or replace function public.conv_sizes()
returns table (id uuid, members int)
language sql stable security definer set search_path = public as $$
  select m.conversation_id, (select count(*)::int from members x where x.conversation_id = m.conversation_id)
    from members m where m.user_id = auth.uid()
$$;
grant execute on function public.conv_sizes() to authenticated;

-- Nouveau groupe : image par défaut aléatoire
create or replace function public.group_default_avatar()
returns trigger language plpgsql as $$
begin
  if new.is_group and new.avatar_url is null then new.avatar_url := public.random_avatar(); end if;
  return new;
end $$;
drop trigger if exists on_group_avatar on public.conversations;
create trigger on_group_avatar before insert on public.conversations
  for each row execute function public.group_default_avatar();
update public.conversations set avatar_url = public.random_avatar() where is_group and avatar_url is null;

-- ---------- Retours : bugs et idées d'évolution ----------------------
-- Les comptes qui voient et gèrent les retours. On s'y ajoute à la main dans le SQL Editor :
--   insert into public.app_admins select id from auth.users where email = '<ton email>';
create table if not exists public.app_admins (
  user_id uuid primary key references auth.users on delete cascade
);
alter table public.app_admins enable row level security;
drop policy if exists "admins self" on public.app_admins;
create policy "admins self" on public.app_admins for select to authenticated using (user_id = auth.uid());
grant select on public.app_admins to authenticated;

create or replace function public.is_app_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from app_admins where user_id = auth.uid())
$$;

create table if not exists public.feedback (
  id         bigint generated always as identity primary key,
  user_id    uuid default auth.uid() references public.profiles on delete set null,
  kind       text not null check (kind in ('bug', 'idea')),
  message    text not null check (char_length(message) between 1 and 2000),
  created_at timestamptz not null default now()
);
alter table public.feedback enable row level security;
drop policy if exists "feedback send" on public.feedback;
create policy "feedback send" on public.feedback for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "feedback admin read" on public.feedback;
create policy "feedback admin read" on public.feedback for select to authenticated using (public.is_app_admin());
drop policy if exists "feedback admin delete" on public.feedback;
create policy "feedback admin delete" on public.feedback for delete to authenticated using (public.is_app_admin());
grant select, insert, delete on public.feedback to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- L'admin voit le nom de l'auteur d'un retour
drop policy if exists "profiles admin read" on public.profiles;
create policy "profiles admin read" on public.profiles for select to authenticated using (public.is_app_admin());
