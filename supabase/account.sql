-- =====================================================================
-- LePtiGrp - suppression de son propre compte (anonymisation). Relançable sans risque.
-- Prérequis : schema.sql, tools.sql (et e2ee.sql, push.sql, extras.sql s'ils sont installés).
-- =====================================================================
-- Le compte de connexion (auth.users) est supprimé : l'email est libéré, plus aucune connexion possible.
-- Le profil reste, anonymisé en « Compte supprimé », pour que l'historique des autres reste juste :
-- messages, dépenses (soldes inchangés), qui a pris quoi, votes.
-- Les clés publiques E2EE restent aussi (vérifier la signature des anciens messages).
-- Tout le reste part : amis, tags, sauvegarde des clés privées, push, rappels, outils perso, conversations quittées.

alter table public.profiles add column if not exists deleted_at timestamptz;
-- Le profil ne disparaît plus avec le compte de connexion
alter table public.profiles drop constraint if exists profiles_id_fkey;

-- Tout le monde peut lire un profil supprimé (il ne contient plus que « Compte supprimé »)
drop policy if exists "profiles deleted read" on public.profiles;
create policy "profiles deleted read" on public.profiles for select to authenticated using (deleted_at is not null);

-- Impossible d'ajouter en ami un compte supprimé (son code ami reste réservé)
create or replace function public.no_deleted_friend()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from profiles where id in (new.user_id, new.friend_id) and deleted_at is not null) then
    raise exception 'Code inconnu';
  end if;
  return new;
end $$;
drop trigger if exists on_friendship_deleted_check on public.friendships;
create trigger on_friendship_deleted_check before insert on public.friendships
  for each row execute function public.no_deleted_friend();

create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  c uuid;
begin
  if me is null then raise exception 'Non connecté'; end if;

  -- Groupes et convs : même logique que « Quitter » (promotion d'un super admin, conv vide supprimée)
  for c in select conversation_id from members where user_id = me loop
    perform public.leave_conversation(c);
  end loop;

  -- Outils perso (moi seul) : supprimés
  delete from lists   where conversation_id is null and participants <@ array[me];
  delete from ledgers where conversation_id is null and participants <@ array[me];
  delete from polls   where conversation_id is null and participants <@ array[me];
  -- Outils partagés : je sors des participants, un autre devient propriétaire
  update lists   set participants = array_remove(participants, me) where me = any(participants);
  update ledgers set participants = array_remove(participants, me) where me = any(participants);
  update polls   set participants = array_remove(participants, me) where me = any(participants);
  update lists l set owner_id = coalesce(l.participants[1],
      (select m.user_id from members m where m.conversation_id = l.conversation_id order by m.joined_at limit 1), owner_id)
   where owner_id = me;
  update ledgers l set owner_id = coalesce(l.participants[1],
      (select m.user_id from members m where m.conversation_id = l.conversation_id order by m.joined_at limit 1), owner_id)
   where owner_id = me;
  update polls l set owner_id = coalesce(l.participants[1],
      (select m.user_id from members m where m.conversation_id = l.conversation_id order by m.joined_at limit 1), owner_id)
   where owner_id = me;

  -- Données personnelles
  delete from friendships where user_id = me or friend_id = me;
  delete from friend_tags where friend_id = me;
  delete from tags where owner_id = me;
  delete from reminders where user_id = me;
  if to_regclass('public.push_subscriptions') is not null then execute 'delete from push_subscriptions where user_id = $1' using me; end if;
  if to_regclass('public.key_backups')        is not null then execute 'delete from key_backups where user_id = $1' using me; end if;

  update profiles set display_name = 'Compte supprimé', avatar_url = null, deleted_at = now() where id = me;
  delete from auth.users where id = me;
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
