-- LePtiGrp - liens « cercle d'amis » : un admin de l'appli crée un lien ; chaque personne qui l'ouvre
-- devient amie avec toutes celles qui l'ont ouvert avant (et donc avec celles d'après).
-- À lancer après extras.sql (is_app_admin) ; relançable. Relancer security.sql ensuite.

create table if not exists public.friend_circles (
  id         uuid primary key default gen_random_uuid(),
  token      text not null unique default substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 18),
  name       text not null check (char_length(name) between 1 and 40),
  active     boolean not null default true,
  created_by uuid references public.profiles on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create table if not exists public.circle_members (
  circle_id uuid not null references public.friend_circles on delete cascade,
  user_id   uuid not null references public.profiles on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (circle_id, user_id)
);
-- Aucun accès direct : tout passe par les fonctions ci-dessous
alter table public.friend_circles enable row level security;
alter table public.circle_members enable row level security;
revoke all on public.friend_circles, public.circle_members from anon, authenticated;

-- Admin : créer un lien
create or replace function public.create_circle(circle_name text)
returns public.friend_circles language plpgsql security definer set search_path = public, extensions as $$
declare c friend_circles;
begin
  if not is_app_admin() then raise exception 'Réservé à l''admin'; end if;
  insert into friend_circles (name, created_by) values (trim(circle_name), auth.uid()) returning * into c;
  return c;
end $$;

-- Admin : mes liens, avec le nombre de personnes qui l'ont ouvert
create or replace function public.list_circles()
returns table (id uuid, token text, name text, active boolean, created_at timestamptz, members int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_app_admin() then raise exception 'Réservé à l''admin'; end if;
  return query select c.id, c.token, c.name, c.active, c.created_at,
    (select count(*)::int from circle_members m where m.circle_id = c.id)
    from friend_circles c order by c.created_at desc;
end $$;

-- Admin : activer / désactiver un lien, ou le supprimer (les amitiés déjà créées restent)
create or replace function public.set_circle_active(circle uuid, on_ boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_app_admin() then raise exception 'Réservé à l''admin'; end if;
  update friend_circles set active = on_ where id = circle;
end $$;
create or replace function public.delete_circle(circle uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_app_admin() then raise exception 'Réservé à l''admin'; end if;
  delete from friend_circles where id = circle;
end $$;

-- Ouvrir le lien : je rejoins le cercle et deviens ami(e) avec tous ses membres
create or replace function public.join_circle(circle_token text)
returns table (name text, new_friends int)
language plpgsql security definer set search_path = public as $$
declare c friend_circles; me uuid := auth.uid(); n int;
begin
  if me is null then raise exception 'Non connecté'; end if;
  select * into c from friend_circles where token = trim(circle_token);
  if c.id is null then raise exception 'Lien inconnu'; end if;
  if not c.active then raise exception 'Ce lien a été désactivé'; end if;
  insert into circle_members (circle_id, user_id) values (c.id, me) on conflict do nothing;
  with others as (
    select m.user_id from circle_members m join profiles p on p.id = m.user_id
     where m.circle_id = c.id and m.user_id <> me and p.deleted_at is null
       and not exists (select 1 from friendships f where f.user_id = me and f.friend_id = m.user_id)
  ), ins as (
    insert into friendships (user_id, friend_id)
    select me, user_id from others union all select user_id, me from others
    on conflict do nothing returning 1
  )
  select count(*) / 2 into n from ins;
  return query select c.name, n;
end $$;

revoke all on function public.create_circle(text), public.list_circles(), public.set_circle_active(uuid, boolean),
  public.delete_circle(uuid), public.join_circle(text) from public, anon;
grant execute on function public.create_circle(text), public.list_circles(), public.set_circle_active(uuid, boolean),
  public.delete_circle(uuid), public.join_circle(text) to authenticated;
