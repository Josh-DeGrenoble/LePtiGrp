-- =====================================================================
-- LePtiGrp - suppression de son propre compte. Relançable sans risque.
-- Prérequis : schema.sql, tools.sql (et e2ee.sql, push.sql, extras.sql s'ils sont installés).
-- =====================================================================
-- Ce qui part : profil, amis, tags, clés E2EE, abonnements push, rappels, outils perso, ses dépenses.
-- Ce qui reste aux autres : les messages (auteur « ancien compte »), les groupes (un autre membre
-- devient super admin) et les outils partagés (un autre participant en devient propriétaire).
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

  -- Outils partagés hors conv : je sors des participants, un autre devient propriétaire
  update lists   set participants = array_remove(participants, me) where me = any(participants) and cardinality(participants) > 1;
  update ledgers set participants = array_remove(participants, me) where me = any(participants) and cardinality(participants) > 1;
  update polls   set participants = array_remove(participants, me) where me = any(participants) and cardinality(participants) > 1;
  update lists l set owner_id = case when l.conversation_id is null then l.participants[1]
    else (select m.user_id from members m where m.conversation_id = l.conversation_id order by m.joined_at limit 1) end
   where owner_id = me and (conversation_id is not null or not me = any(participants));
  update ledgers l set owner_id = case when l.conversation_id is null then l.participants[1]
    else (select m.user_id from members m where m.conversation_id = l.conversation_id order by m.joined_at limit 1) end
   where owner_id = me and (conversation_id is not null or not me = any(participants));
  update polls l set owner_id = case when l.conversation_id is null then l.participants[1]
    else (select m.user_id from members m where m.conversation_id = l.conversation_id order by m.joined_at limit 1) end
   where owner_id = me and (conversation_id is not null or not me = any(participants));

  -- Le compte : la cascade efface profil, amitiés, tags, clés, push, rappels, outils perso restants
  delete from auth.users where id = me;
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
