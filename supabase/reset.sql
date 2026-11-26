-- LePtiGrp - REMISE À ZÉRO DES DONNÉES (IRRÉVERSIBLE)
-- Efface : conversations et groupes (messages, membres, clés de conv), pense-bêtes, comptes, sondages,
-- rappels, amitiés, tags, retours, cercles d'amis, comptes de test (@test.leptigrp) et comptes supprimés.
-- Garde : la structure (tables, fonctions, règles), les comptes réels (profil, clés de chiffrement,
-- abonnements aux notifs) et la liste des admins.
-- Variante : mettre « tout_effacer := true » ci-dessous pour supprimer aussi tous les comptes réels
-- sauf ceux des admins de l'appli.
-- Après : vider le dossier du bucket « media » dans Storage (les photos ne peuvent pas être effacées en SQL).

do $$
declare
  tout_effacer boolean := false;
  t text;
begin
  -- Dans l'ordre : conversations (messages, membres, clés, outils et rappels rattachés), puis le reste.
  -- Une table absente (fichier SQL pas encore lancé) est ignorée.
  foreach t in array array['conversations', 'lists', 'ledgers', 'polls', 'reminders', 'feedback', 'friend_circles',
                           'friend_code_attempts', 'usage_alerts', 'friend_tags', 'tags', 'friendships'] loop
    if to_regclass('public.' || t) is not null then execute format('delete from public.%I', t); end if;
  end loop;

  -- Comptes de test, comptes « supprimés » (et tous les non-admins si tout_effacer)
  create temp table gone on commit drop as
    select p.id from public.profiles p
      left join auth.users u on u.id = p.id
     where u.id is null
        or u.email like '%@test.leptigrp'
        or p.deleted_at is not null
        or (tout_effacer and p.id not in (select user_id from public.app_admins));
  foreach t in array array['push_subscriptions', 'key_backups', 'user_keys'] loop
    if to_regclass('public.' || t) is not null then execute format('delete from public.%I where user_id in (select id from gone)', t); end if;
  end loop;
  delete from public.profiles where id in (select id from gone);
  delete from auth.users where id in (select id from gone);

  raise notice 'Remise à zéro faite. Comptes restants : %', (select count(*) from public.profiles);
end $$;
