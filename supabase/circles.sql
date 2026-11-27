-- LePtiGrp - liens « cercle d'amis » : un admin de l'appli crée un lien ; chaque personne qui l'ouvre
-- devient amie avec toutes celles qui l'ont ouvert avant (et donc avec celles d'après).
-- À lancer après extras.sql (is_app_admin) ; relançable. Relancer security.sql ensuite.
-- Ouverts à tous : chacun crée ses cercles ; créateur et membres les gèrent (l'admin voit tout).

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
-- Qui peut gérer un cercle : son créateur, ses membres (une modif vaut pour tout le monde) et l'admin de l'appli
create or replace function public.circle_can(circle uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select is_app_admin()
      or exists (select 1 from friend_circles where id = circle and created_by = auth.uid())
      or exists (select 1 from circle_members where circle_id = circle and user_id = auth.uid())
$$;
revoke all on function public.circle_can(uuid) from public, anon;
grant execute on function public.circle_can(uuid) to authenticated;

-- Tout le monde peut créer un cercle ; son créateur en fait partie d'office
create or replace function public.create_circle(circle_name text)
returns public.friend_circles language plpgsql security definer set search_path = public, extensions as $$
declare c friend_circles;
begin
  if auth.uid() is null then raise exception 'Non connecté'; end if;
  if coalesce(trim(circle_name), '') = '' or char_length(trim(circle_name)) > 40 then raise exception 'Nom invalide'; end if;
  insert into friend_circles (name, created_by) values (trim(circle_name), auth.uid()) returning * into c;
  insert into circle_members (circle_id, user_id) values (c.id, auth.uid()) on conflict do nothing;
  return c;
end $$;

-- Mes cercles (l'admin les voit tous)
drop function if exists public.list_circles();
create or replace function public.list_circles()
returns table (id uuid, token text, name text, active boolean, created_at timestamptz, members int)
language plpgsql stable security definer set search_path = public as $$
begin
  return query select c.id, c.token, c.name, c.active, c.created_at,
    (select count(*)::int from circle_members m where m.circle_id = c.id)
    from friend_circles c where circle_can(c.id) order by c.created_at desc;
end $$;

create or replace function public.set_circle_active(circle uuid, on_ boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not circle_can(circle) then raise exception 'Cercle introuvable'; end if;
  update friend_circles set active = on_ where id = circle;
end $$;

create or replace function public.rename_circle(circle uuid, circle_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not circle_can(circle) then raise exception 'Cercle introuvable'; end if;
  if coalesce(trim(circle_name), '') = '' or char_length(trim(circle_name)) > 40 then raise exception 'Nom invalide'; end if;
  update friend_circles set name = trim(circle_name) where id = circle;
end $$;
revoke all on function public.rename_circle(uuid, text) from public, anon;
grant execute on function public.rename_circle(uuid, text) to authenticated;

create or replace function public.delete_circle(circle uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not circle_can(circle) then raise exception 'Cercle introuvable'; end if;
  delete from friend_circles where id = circle;
end $$;

create or replace function public.circle_enroll(circle uuid, who uuid)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  insert into circle_members (circle_id, user_id) values (circle, who) on conflict do nothing;
  with others as (
    select m.user_id from circle_members m join profiles p on p.id = m.user_id
     where m.circle_id = circle and m.user_id <> who and p.deleted_at is null
       and not exists (select 1 from friendships f where f.user_id = who and f.friend_id = m.user_id)
  ), ins as (
    insert into friendships (user_id, friend_id)
    select who, user_id from others union all select user_id, who from others
    on conflict do nothing returning 1
  )
  select count(*) / 2 into n from ins;
  return n;
end $$;
revoke all on function public.circle_enroll(uuid, uuid) from public, anon, authenticated;

create or replace function public.join_circle(circle_token text)
returns table (name text, new_friends int)
language plpgsql security definer set search_path = public as $$
declare c friend_circles; me uuid := auth.uid();
begin
  if me is null then raise exception 'Non connecté'; end if;
  select * into c from friend_circles where token = trim(circle_token);
  if c.id is null then raise exception 'Lien inconnu'; end if;
  if not c.active then raise exception 'Ce lien a été désactivé'; end if;
  return query select c.name, circle_enroll(c.id, me);
end $$;

-- Admin : tous les comptes de l'appli, avec « dans le cercle » ou non
-- Les membres du cercle, et les gens qu'on peut y ajouter : tous les comptes pour l'admin, mes amis sinon
create or replace function public.circle_people(circle uuid)
returns table (id uuid, display_name text, avatar_url text, in_circle boolean)
language plpgsql stable security definer set search_path = public as $$
declare adm boolean := is_app_admin();
begin
  if not circle_can(circle) then raise exception 'Cercle introuvable'; end if;
  return query select p.id, p.display_name, p.avatar_url,
    exists (select 1 from circle_members m where m.circle_id = circle and m.user_id = p.id)
    from profiles p where p.deleted_at is null
      and (adm or p.id = auth.uid()
           or exists (select 1 from circle_members m where m.circle_id = circle and m.user_id = p.id)
           or exists (select 1 from friendships f where f.user_id = auth.uid() and f.friend_id = p.id))
    order by p.display_name;
end $$;

-- Ajouter à la main (même effet que le lien, même désactivé) : un ami, ou n'importe qui pour l'admin
create or replace function public.circle_add(circle uuid, who uuid)
returns int language plpgsql security definer set search_path = public as $$
begin
  if not circle_can(circle) then raise exception 'Cercle introuvable'; end if;
  if not exists (select 1 from profiles where id = who and deleted_at is null) then raise exception 'Compte introuvable'; end if;
  if not is_app_admin() and who <> auth.uid() and not is_friend(who) then raise exception 'Tu ne peux ajouter que tes amis'; end if;
  return circle_enroll(circle, who);
end $$;

-- Retirer du cercle (les amitiés déjà créées restent)
create or replace function public.circle_remove(circle uuid, who uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not circle_can(circle) then raise exception 'Cercle introuvable'; end if;
  delete from circle_members where circle_id = circle and user_id = who;
end $$;

revoke all on function public.circle_people(uuid), public.circle_add(uuid, uuid), public.circle_remove(uuid, uuid) from public, anon;
grant execute on function public.circle_people(uuid), public.circle_add(uuid, uuid), public.circle_remove(uuid, uuid) to authenticated;

revoke all on function public.create_circle(text), public.list_circles(), public.set_circle_active(uuid, boolean),
  public.delete_circle(uuid), public.join_circle(text) from public, anon;
grant execute on function public.create_circle(text), public.list_circles(), public.set_circle_active(uuid, boolean),
  public.delete_circle(uuid), public.join_circle(text) to authenticated;
