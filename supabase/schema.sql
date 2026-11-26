-- =====================================================================
-- LePtiGrp - schéma V1 (chat)
-- À coller dans Supabase > SQL Editor > New query > Run
-- =====================================================================

-- ---------- Tables ----------------------------------------------------

create table public.profiles (
  id            uuid primary key references auth.users on delete cascade,
  display_name  text not null,
  avatar_url    text,
  friend_code   char(5) not null unique,
  created_at    timestamptz not null default now()
);

create table public.friendships (
  user_id    uuid not null references public.profiles on delete cascade,
  friend_id  uuid not null references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);

create table public.tags (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references public.profiles on delete cascade,
  name       text not null check (length(trim(name)) between 1 and 30),
  color      text not null default '#2563eb',
  created_at timestamptz not null default now(),
  unique (owner_id, name)
);

create table public.friend_tags (
  tag_id    uuid not null references public.tags on delete cascade,
  friend_id uuid not null references public.profiles on delete cascade,
  primary key (tag_id, friend_id)
);

create table public.conversations (
  id                     uuid primary key default gen_random_uuid(),
  is_group               boolean not null default true,
  name                   text,
  avatar_url             text,
  everyone_admin         boolean not null default false, -- "Tout le monde admin ?"
  admins_manage_pins     boolean not null default true,  -- "Peuvent gérer les msg importants"
  admins_manage_members  boolean not null default false, -- "Peuvent exclure/inviter des membres"
  created_by             uuid references public.profiles on delete set null,
  created_at             timestamptz not null default now(),
  last_message_at        timestamptz not null default now()
);

create table public.members (
  conversation_id  uuid not null references public.conversations on delete cascade,
  user_id          uuid not null references public.profiles on delete cascade,
  role             text not null default 'member' check (role in ('super_admin','admin','member')),
  is_favorite      boolean not null default false,
  notify_all       boolean not null default true,
  notify_mentions  boolean not null default true,
  notify_pins      boolean not null default true,
  hidden_at        timestamptz,  -- "supprimer la conversation" (masquée pour moi)
  last_read_at     timestamptz not null default now(),
  joined_at        timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index on public.members (user_id);

create table public.messages (
  id               bigint generated always as identity primary key,
  conversation_id  uuid not null references public.conversations on delete cascade,
  author_id        uuid references public.profiles on delete set null default auth.uid(),
  content          text not null check (length(content) between 1 and 4000),
  mentions         uuid[] not null default '{}',
  mention_all      boolean not null default false,
  pinned_at        timestamptz,
  pinned_until     timestamptz,  -- null + pinned_at non null = épinglé sans limite
  pinned_by        uuid references public.profiles on delete set null,
  created_at       timestamptz not null default now()
);
create index on public.messages (conversation_id, created_at desc);

-- ---------- Helpers ---------------------------------------------------

create or replace function public.is_member(conv uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from members where conversation_id = conv and user_id = auth.uid());
$$;

-- Rôle effectif ("tout le monde admin" transforme les membres en admins)
create or replace function public.my_role(conv uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when m.role = 'member' and c.everyone_admin then 'admin'
    else m.role end
  from members m join conversations c on c.id = m.conversation_id
  where m.conversation_id = conv and m.user_id = auth.uid();
$$;

create or replace function public.can_manage_pins(conv uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select case public.my_role(conv)
       when 'super_admin' then true
       when 'admin' then c.admins_manage_pins or not c.is_group
       else not c.is_group end
     from conversations c where c.id = conv), false);
$$;

create or replace function public.can_manage_members(conv uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select c.is_group and case public.my_role(conv)
       when 'super_admin' then true
       when 'admin' then c.admins_manage_members
       else false end
     from conversations c where c.id = conv), false);
$$;

create or replace function public.shares_conversation(other uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from members a join members b on a.conversation_id = b.conversation_id
    where a.user_id = auth.uid() and b.user_id = other);
$$;

create or replace function public.is_friend(other uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from friendships where user_id = auth.uid() and friend_id = other);
$$;

-- ---------- Création du profil à l'inscription ------------------------

create or replace function public.random_avatar()
returns text language sql volatile as $$
  select (array['emoji:🦊:#fde68a','emoji:🐼:#bbf7d0','emoji:🐸:#bfdbfe','emoji:🦁:#fbcfe8','emoji:🐙:#ddd6fe','emoji:🦄:#fed7aa','emoji:🐧:#a5f3fc','emoji:🐨:#fecaca','emoji:🦉:#fde68a','emoji:🐢:#bbf7d0','emoji:🐝:#bfdbfe','emoji:🦖:#fbcfe8','emoji:👾:#ddd6fe','emoji:🤖:#fed7aa','emoji:👻:#a5f3fc','emoji:🌵:#fecaca','emoji:🍕:#fde68a','emoji:🎸:#bbf7d0','emoji:🚀:#bfdbfe','emoji:⚡:#fbcfe8'])[1 + floor(random() * 20)::int];
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare code text;
begin
  loop
    code := lpad((floor(random() * 100000))::int::text, 5, '0');
    exit when not exists (select 1 from profiles where friend_code = code);
  end loop;
  insert into profiles (id, display_name, friend_code, avatar_url)
  values (new.id,
          coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), split_part(new.email, '@', 1)),
          code, public.random_avatar());
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- Date du dernier message sur la conversation
create or replace function public.touch_conversation()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update conversations set last_message_at = new.created_at where id = new.conversation_id;
  return new;
end $$;

create trigger on_message_insert
  after insert on public.messages for each row execute function public.touch_conversation();

-- ---------- RLS -------------------------------------------------------

alter table public.profiles      enable row level security;
alter table public.friendships   enable row level security;
alter table public.tags          enable row level security;
alter table public.friend_tags   enable row level security;
alter table public.conversations enable row level security;
alter table public.members       enable row level security;
alter table public.messages      enable row level security;

-- profils : moi, mes amis, et les gens avec qui je partage une conv
create policy "profiles read" on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_friend(id) or public.shares_conversation(id));
create policy "profiles update self" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;

create policy "friendships read" on public.friendships for select to authenticated
  using (user_id = auth.uid());

create policy "tags owner" on public.tags for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

create policy "friend_tags owner" on public.friend_tags for all to authenticated
  using (exists (select 1 from public.tags t where t.id = tag_id and t.owner_id = auth.uid()))
  with check (exists (select 1 from public.tags t where t.id = tag_id and t.owner_id = auth.uid())
              and public.is_friend(friend_id));

create policy "conversations read" on public.conversations for select to authenticated
  using (public.is_member(id));

create policy "members read" on public.members for select to authenticated
  using (public.is_member(conversation_id));
create policy "members update self" on public.members for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke update on public.members from authenticated;
grant update (is_favorite, notify_all, notify_mentions, notify_pins, hidden_at, last_read_at)
  on public.members to authenticated;

create policy "messages read" on public.messages for select to authenticated
  using (public.is_member(conversation_id));
create policy "messages insert" on public.messages for insert to authenticated
  with check (author_id = auth.uid() and public.is_member(conversation_id)
              and pinned_at is null and pinned_until is null and pinned_by is null);

-- ---------- RPC : amis ------------------------------------------------

create or replace function public.add_friend_by_code(code text)
returns public.profiles language plpgsql security definer set search_path = public as $$
declare p profiles;
begin
  select * into p from profiles where friend_code = trim(code);
  if p.id is null then raise exception 'Code inconnu'; end if;
  if p.id = auth.uid() then raise exception 'C''est ton propre code'; end if;
  insert into friendships (user_id, friend_id) values (auth.uid(), p.id), (p.id, auth.uid())
  on conflict do nothing;
  return p;
end $$;

create or replace function public.remove_friend(friend uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from friendships where (user_id = auth.uid() and friend_id = friend)
                             or (user_id = friend and friend_id = auth.uid());
  delete from friend_tags ft using tags t
   where ft.tag_id = t.id and t.owner_id = auth.uid() and ft.friend_id = friend;
end $$;

-- ---------- RPC : conversations ---------------------------------------

-- Ouvre (ou crée) la conversation privée avec un ami
create or replace function public.get_or_create_dm(friend uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare conv uuid;
begin
  if not public.is_friend(friend) then raise exception 'Pas dans tes amis'; end if;
  select c.id into conv from conversations c
    join members a on a.conversation_id = c.id and a.user_id = auth.uid()
    join members b on b.conversation_id = c.id and b.user_id = friend
   where not c.is_group limit 1;
  if conv is null then
    insert into conversations (is_group, created_by) values (false, auth.uid()) returning id into conv;
    insert into members (conversation_id, user_id, role)
      values (conv, auth.uid(), 'super_admin'), (conv, friend, 'super_admin');
  else
    update members set hidden_at = null where conversation_id = conv and user_id = auth.uid();
  end if;
  return conv;
end $$;

create or replace function public.create_group(group_name text, member_ids uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare conv uuid; m uuid;
begin
  if coalesce(trim(group_name), '') = '' then raise exception 'Nom du groupe requis'; end if;
  insert into conversations (is_group, name, created_by) values (true, trim(group_name), auth.uid())
    returning id into conv;
  insert into members (conversation_id, user_id, role) values (conv, auth.uid(), 'super_admin');
  foreach m in array coalesce(member_ids, '{}') loop
    if public.is_friend(m) then
      insert into members (conversation_id, user_id) values (conv, m) on conflict do nothing;
    end if;
  end loop;
  return conv;
end $$;

create or replace function public.update_group(conv uuid, group_name text,
  p_everyone_admin boolean, p_admins_manage_pins boolean, p_admins_manage_members boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.my_role(conv) is distinct from 'super_admin' then raise exception 'Réservé au super admin'; end if;
  update conversations set
    name = coalesce(nullif(trim(group_name), ''), name),
    everyone_admin = p_everyone_admin,
    admins_manage_pins = p_admins_manage_pins,
    admins_manage_members = p_admins_manage_members
  where id = conv and is_group;
end $$;

create or replace function public.add_members(conv uuid, member_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare m uuid;
begin
  if not public.can_manage_members(conv) then raise exception 'Tu ne peux pas inviter'; end if;
  foreach m in array member_ids loop
    if public.is_friend(m) then
      insert into members (conversation_id, user_id) values (conv, m)
      on conflict (conversation_id, user_id) do nothing;
    end if;
  end loop;
end $$;

create or replace function public.remove_member(conv uuid, member uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage_members(conv) then raise exception 'Tu ne peux pas exclure'; end if;
  if (select role from members where conversation_id = conv and user_id = member) = 'super_admin'
     and public.my_role(conv) <> 'super_admin' then
    raise exception 'Impossible d''exclure un super admin';
  end if;
  delete from members where conversation_id = conv and user_id = member;
end $$;

create or replace function public.set_member_role(conv uuid, member uuid, new_role text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.my_role(conv) is distinct from 'super_admin' then raise exception 'Réservé au super admin'; end if;
  if member = auth.uid() then raise exception 'Tu ne peux pas changer ton propre rôle'; end if;
  update members set role = new_role where conversation_id = conv and user_id = member;
end $$;

create or replace function public.leave_conversation(conv uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from members where conversation_id = conv and user_id = auth.uid();
  if not exists (select 1 from members where conversation_id = conv) then
    delete from conversations where id = conv;
  elsif not exists (select 1 from members where conversation_id = conv and role = 'super_admin') then
    -- on promeut le plus ancien membre
    update members set role = 'super_admin'
     where (conversation_id, user_id) = (
       select conversation_id, user_id from members where conversation_id = conv
        order by joined_at limit 1);
  end if;
end $$;

-- Liste de mes conversations (avec dernier message et nom calculé pour les convs privées)
create or replace function public.my_conversations()
returns table (
  id uuid, is_group boolean, name text, avatar_url text, other_user_id uuid,
  is_favorite boolean, notify_all boolean, notify_mentions boolean, notify_pins boolean,
  last_message_at timestamptz, last_content text, last_author text, unread int)
language sql stable security definer set search_path = public as $$
  select c.id, c.is_group,
         case when c.is_group then c.name else op.display_name end,
         case when c.is_group then c.avatar_url else op.avatar_url end,
         op.id,
         m.is_favorite, m.notify_all, m.notify_mentions, m.notify_pins,
         c.last_message_at, lm.content, la.display_name,
         (select count(*)::int from messages x where x.conversation_id = c.id
             and x.created_at > m.last_read_at and x.author_id <> auth.uid())
    from members m
    join conversations c on c.id = m.conversation_id
    left join lateral (
      select p.* from members o join profiles p on p.id = o.user_id
       where not c.is_group and o.conversation_id = c.id and o.user_id <> auth.uid() limit 1) op on true
    left join lateral (
      select * from messages x where x.conversation_id = c.id
         and (m.hidden_at is null or x.created_at > m.hidden_at)
       order by x.created_at desc limit 1) lm on true
    left join profiles la on la.id = lm.author_id
   where m.user_id = auth.uid()
     and (m.hidden_at is null or c.last_message_at > m.hidden_at)
   order by m.is_favorite desc, c.last_message_at desc;
$$;

-- ---------- RPC : messages --------------------------------------------

create or replace function public.pin_message(msg bigint, until timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare conv uuid;
begin
  select conversation_id into conv from messages where id = msg;
  if not public.can_manage_pins(conv) then raise exception 'Tu ne peux pas épingler'; end if;
  update messages set pinned_at = now(), pinned_until = until, pinned_by = auth.uid() where id = msg;
end $$;

create or replace function public.unpin_message(msg bigint)
returns void language plpgsql security definer set search_path = public as $$
declare conv uuid;
begin
  select conversation_id into conv from messages where id = msg;
  if not public.can_manage_pins(conv) then raise exception 'Tu ne peux pas désépingler'; end if;
  update messages set pinned_at = null, pinned_until = null, pinned_by = null where id = msg;
end $$;

create or replace function public.unpin_all(conv uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can_manage_pins(conv) then raise exception 'Tu ne peux pas désépingler'; end if;
  update messages set pinned_at = null, pinned_until = null, pinned_by = null
   where conversation_id = conv and pinned_at is not null;
end $$;

create or replace function public.delete_message(msg bigint)
returns void language plpgsql security definer set search_path = public as $$
declare m messages;
begin
  select * into m from messages where id = msg;
  if m.author_id = auth.uid()
     or (public.my_role(m.conversation_id) in ('admin','super_admin')
         and (select is_group from conversations where id = m.conversation_id)) then
    delete from messages where id = msg;
  else
    raise exception 'Tu ne peux supprimer que tes messages';
  end if;
end $$;

-- ---------- Droits ---------------------------------------------------

-- Droits d'accès de l'appli aux tables (la sécurité ligne par ligne reste assurée par les règles RLS).
-- Nécessaire sur les projets Supabase qui n'exposent pas automatiquement les nouvelles tables.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- Colonnes modifiables uniquement
revoke update on public.profiles, public.members from authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;
grant update (is_favorite, notify_all, notify_mentions, notify_pins, hidden_at, last_read_at) on public.members to authenticated;

-- ---------- Temps réel ------------------------------------------------

alter publication supabase_realtime add table public.messages, public.members, public.conversations;
