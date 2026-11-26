-- =====================================================================
-- LePtiGrp - droits configurables des groupes
-- Chaque action a un niveau : 'all' (tout le monde), 'admins' (admins + super admins), 'super' (super admins).
-- Le super admin peut toujours tout faire. "Tout le monde admin" reste un raccourci.
-- =====================================================================

alter table public.conversations
  add column if not exists permissions jsonb not null default '{}'::jsonb;

-- Reprise des anciennes options (seulement au premier passage : les colonnes sont ensuite supprimées)
do $$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'conversations' and column_name = 'admins_manage_pins') then
    execute $q$update public.conversations set permissions = jsonb_build_object(
      'pin',    case when admins_manage_pins then 'admins' else 'super' end,
      'invite', case when admins_manage_members then 'admins' else 'super' end,
      'kick',   case when admins_manage_members then 'admins' else 'super' end)
    where permissions = '{}'::jsonb$q$;
  end if;
end $$;

alter table public.conversations drop column if exists admins_manage_pins;
alter table public.conversations drop column if exists admins_manage_members;

-- Niveaux par défaut (identiques côté appli : src/lib/permissions.ts)
create or replace function public.default_permission(action text)
returns text language sql immutable as $$
  select case action
    when 'write' then 'all' when 'mention_all' then 'all' when 'pin' then 'admins'
    when 'delete_others' then 'admins' when 'invite' then 'admins' when 'kick' then 'super'
    when 'edit_info' then 'admins' when 'manage_admins' then 'super' else 'super' end;
$$;

-- Ai-je le droit de faire `action` dans cette conversation ?
create or replace function public.can(conv uuid, action text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare c conversations; r text; lvl text;
begin
  select * into c from conversations where id = conv;
  r := public.my_role(conv);
  if c.id is null or r is null then return false; end if;
  -- conversation privée : on peut écrire, mentionner et épingler, rien d'autre
  if not c.is_group then return action in ('write', 'mention_all', 'pin'); end if;
  if r = 'super_admin' then return true; end if;
  lvl := coalesce(c.permissions->>action, public.default_permission(action));
  return lvl = 'all' or (lvl = 'admins' and r = 'admin');
end $$;

-- Anciennes fonctions, branchées sur les nouveaux droits
create or replace function public.can_manage_pins(conv uuid)
returns boolean language sql stable security definer set search_path = public as $$ select public.can(conv, 'pin') $$;
create or replace function public.can_manage_members(conv uuid)
returns boolean language sql stable security definer set search_path = public as $$ select public.can(conv, 'invite') $$;

-- Écriture : droit "write", et "mention_all" pour @tous
drop policy if exists "messages insert" on public.messages;
create policy "messages insert" on public.messages for insert to authenticated
  with check (author_id = auth.uid() and public.can(conversation_id, 'write')
              and (not mention_all or public.can(conversation_id, 'mention_all'))
              and pinned_at is null and pinned_until is null and pinned_by is null);

create or replace function public.delete_message(msg bigint)
returns void language plpgsql security definer set search_path = public as $$
declare m messages;
begin
  select * into m from messages where id = msg;
  if m.author_id = auth.uid() or public.can(m.conversation_id, 'delete_others') then
    delete from messages where id = msg;
  else
    raise exception 'Tu ne peux supprimer que tes messages';
  end if;
end $$;

create or replace function public.add_members(conv uuid, member_ids uuid[])
returns void language plpgsql security definer set search_path = public as $$
declare m uuid;
begin
  if not public.can(conv, 'invite') then raise exception 'Tu ne peux pas inviter'; end if;
  foreach m in array member_ids loop
    if public.is_friend(m) then
      insert into members (conversation_id, user_id) values (conv, m) on conflict do nothing;
    end if;
  end loop;
end $$;

create or replace function public.remove_member(conv uuid, member uuid)
returns void language plpgsql security definer set search_path = public as $$
declare target text;
begin
  if not public.can(conv, 'kick') then raise exception 'Tu ne peux pas exclure'; end if;
  select role into target from members where conversation_id = conv and user_id = member;
  -- seul un super admin peut exclure un admin ou un super admin
  if target <> 'member' and public.my_role(conv) <> 'super_admin' then
    raise exception 'Seul un super admin peut exclure un admin';
  end if;
  delete from members where conversation_id = conv and user_id = member;
end $$;

create or replace function public.set_member_role(conv uuid, member uuid, new_role text)
returns void language plpgsql security definer set search_path = public as $$
declare target text;
begin
  if member = auth.uid() then raise exception 'Tu ne peux pas changer ton propre rôle'; end if;
  select role into target from members where conversation_id = conv and user_id = member;
  if public.my_role(conv) <> 'super_admin' then
    if not public.can(conv, 'manage_admins') then raise exception 'Tu ne peux pas gérer les admins'; end if;
    if new_role = 'super_admin' or target = 'super_admin' then raise exception 'Réservé au super admin'; end if;
  end if;
  update members set role = new_role where conversation_id = conv and user_id = member;
end $$;

-- Nom et photo du groupe : droit "edit_info"
create or replace function public.update_group_info(conv uuid, group_name text, group_avatar text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can(conv, 'edit_info') then raise exception 'Tu ne peux pas modifier le groupe'; end if;
  update conversations set
    name = coalesce(nullif(trim(group_name), ''), name),
    avatar_url = group_avatar
  where id = conv and is_group;
end $$;

-- Réglages des droits : super admin uniquement
drop function if exists public.update_group(uuid, text, boolean, boolean, boolean);
create or replace function public.update_group_settings(conv uuid, p_everyone_admin boolean, p_permissions jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.my_role(conv) is distinct from 'super_admin' then raise exception 'Réservé au super admin'; end if;
  update conversations set everyone_admin = p_everyone_admin, permissions = p_permissions
  where id = conv and is_group;
end $$;

grant execute on all functions in schema public to authenticated;

-- Fonctions internes (cron) et colonnes figées des outils : à refermer après le « grant » ci-dessus (voir security.sql)
do $$
declare f text;
begin
  foreach f in array array['public.send_due_reminders()', 'public.check_usage()', 'public.usage_now()'] loop
    if to_regprocedure(f) is not null then execute format('revoke execute on function %s from public, anon, authenticated', f); end if;
  end loop;
  if to_regclass('public.lists') is not null then
    revoke update on public.lists, public.ledgers, public.polls from authenticated;
    grant update (name, categories) on public.lists to authenticated;
    grant update (name) on public.ledgers to authenticated;
    grant update (question) on public.polls to authenticated;
  end if;
end $$;
