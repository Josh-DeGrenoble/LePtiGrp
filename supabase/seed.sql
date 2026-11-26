-- =====================================================================
-- LePtiGrp - données de test
-- 1. Crée d'abord TON compte dans l'appli.
-- 2. Colle ce fichier dans Supabase > SQL Editor > Run.
-- Relançable sans risque : il efface puis recrée les comptes de test.
--
-- Comptes de test (pour te connecter en tant qu'eux sur un 2e appareil) :
--   lea@test.leptigrp, antoine@test.leptigrp, camille@test.leptigrp, hugo@test.leptigrp,
--   ines@test.leptigrp, maxime@test.leptigrp, sarah@test.leptigrp, tom@test.leptigrp
--   Mot de passe : test1234
-- Tom n'est PAS ton ami : son code ami (affiché à la fin) te permet de tester l'ajout.
-- =====================================================================

do $$
declare
  me uuid;
  u  jsonb := '{}';
  n  text;
  i  int := 0;
  t_famille uuid; t_escalade uuid; t_boulot uuid; t_coloc uuid;
  c_lea uuid; c_antoine uuid; c_zamis uuid; c_escalade uuid; c_coloc uuid;
  names text[] := array['Léa','Antoine','Camille','Hugo','Inès','Maxime','Sarah','Tom'];
  mails text[] := array['lea','antoine','camille','hugo','ines','maxime','sarah','tom'];
  uid uuid;
begin
  -- Nettoyage d'un précédent passage
  delete from public.conversations c where exists (
    select 1 from public.members m join auth.users au on au.id = m.user_id
     where m.conversation_id = c.id and au.email like '%@test.leptigrp');
  delete from auth.users where email like '%@test.leptigrp';

  -- Ton compte (le plus ancien compte "réel")
  select id into me from auth.users where email not like '%@test.leptigrp' order by created_at limit 1;
  if me is null then raise exception 'Crée d''abord ton compte dans l''appli, puis relance ce script.'; end if;

  -- Comptes de test
  for i in 1..array_length(names, 1) loop
    uid := gen_random_uuid();
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change)
    values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
      mails[i] || '@test.leptigrp', crypt('test1234', gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', jsonb_build_object('display_name', names[i]),
      now() - interval '30 days', now(), '', '', '', '');
    insert into auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), uid, uid::text, 'email',
      jsonb_build_object('sub', uid::text, 'email', mails[i] || '@test.leptigrp', 'email_verified', true), now(), now(), now());
    u := u || jsonb_build_object(mails[i], uid);
  end loop;

  -- Amitiés (tout le monde sauf Tom est ton ami, et ils sont amis entre eux)
  insert into public.friendships (user_id, friend_id)
  select a, b from (
    select me as a, (u->>k)::uuid as b from unnest(array['lea','antoine','camille','hugo','ines','maxime','sarah']) k
    union all
    select (u->>k)::uuid, me from unnest(array['lea','antoine','camille','hugo','ines','maxime','sarah']) k
    union all
    select (u->>a1)::uuid, (u->>b1)::uuid
      from unnest(array['lea','antoine','camille','hugo']) a1, unnest(array['lea','antoine','camille','hugo']) b1 where a1 <> b1
  ) s on conflict do nothing;

  -- Tes tags
  insert into public.tags (owner_id, name, color) values (me, 'Famille', '#ec4899') on conflict (owner_id, name) do update set color = excluded.color returning id into t_famille;
  insert into public.tags (owner_id, name, color) values (me, 'Escalade', '#10b981') on conflict (owner_id, name) do update set color = excluded.color returning id into t_escalade;
  insert into public.tags (owner_id, name, color) values (me, 'Boulot', '#2563eb') on conflict (owner_id, name) do update set color = excluded.color returning id into t_boulot;
  insert into public.tags (owner_id, name, color) values (me, 'Coloc', '#f59e0b') on conflict (owner_id, name) do update set color = excluded.color returning id into t_coloc;
  insert into public.friend_tags (tag_id, friend_id) values
    (t_famille, (u->>'lea')::uuid), (t_famille, (u->>'ines')::uuid),
    (t_escalade, (u->>'lea')::uuid), (t_escalade, (u->>'hugo')::uuid), (t_escalade, (u->>'antoine')::uuid),
    (t_boulot, (u->>'maxime')::uuid), (t_boulot, (u->>'sarah')::uuid),
    (t_coloc, (u->>'antoine')::uuid), (t_coloc, (u->>'camille')::uuid);

  -- Conv privée avec Léa (en favori)
  insert into public.conversations (is_group, created_by) values (false, me) returning id into c_lea;
  insert into public.members (conversation_id, user_id, role, is_favorite) values
    (c_lea, me, 'super_admin', true), (c_lea, (u->>'lea')::uuid, 'super_admin', false);
  insert into public.messages (conversation_id, author_id, content, created_at) values
    (c_lea, me, 'Tu viens samedi ?', now() - interval '5 hours'),
    (c_lea, (u->>'lea')::uuid, 'Je sais pas encore, je te dis demain', now() - interval '4 hours 50 minutes'),
    (c_lea, (u->>'lea')::uuid, 'On verra bien :)', now() - interval '4 hours 49 minutes');

  -- Conv privée avec Antoine
  insert into public.conversations (is_group, created_by) values (false, (u->>'antoine')::uuid) returning id into c_antoine;
  insert into public.members (conversation_id, user_id, role) values
    (c_antoine, me, 'super_admin'), (c_antoine, (u->>'antoine')::uuid, 'super_admin');
  insert into public.messages (conversation_id, author_id, content, created_at) values
    (c_antoine, (u->>'antoine')::uuid, 'Tu me rends ma perceuse quand ?', now() - interval '3 days'),
    (c_antoine, me, 'Ce week-end promis', now() - interval '3 days' + interval '10 minutes');

  -- Groupe "Les Zamis" : tu es super admin (favori)
  insert into public.conversations (is_group, name, created_by) values (true, 'Les Zamis', me) returning id into c_zamis;
  insert into public.members (conversation_id, user_id, role, is_favorite, joined_at) values
    (c_zamis, me, 'super_admin', true, now() - interval '20 days'),
    (c_zamis, (u->>'lea')::uuid, 'admin', false, now() - interval '19 days'),
    (c_zamis, (u->>'antoine')::uuid, 'member', false, now() - interval '19 days'),
    (c_zamis, (u->>'camille')::uuid, 'member', false, now() - interval '18 days');
  insert into public.messages (conversation_id, author_id, content, mentions, mention_all, pinned_at, pinned_until, pinned_by, created_at) values
    (c_zamis, me, 'Pensez aux courses ! @tous', '{}', true, now() - interval '2 days', now() + interval '2 days', me, now() - interval '2 days 1 hour'),
    (c_zamis, me, 'On se retrouve chez moi du coup', '{}', false, now() - interval '2 days', now() + interval '4 hours', me, now() - interval '2 days'),
    (c_zamis, (u->>'camille')::uuid, 'Top, j''amène un gâteau', '{}', false, null, null, null, now() - interval '1 day 20 hours'),
    (c_zamis, (u->>'antoine')::uuid, 'On se retrouve à 18h', '{}', false, now() - interval '1 day', null, (u->>'lea')::uuid, now() - interval '1 day'),
    (c_zamis, (u->>'lea')::uuid, 'Je prends des chips perso', '{}', false, null, null, null, now() - interval '3 hours'),
    (c_zamis, (u->>'antoine')::uuid, 'Je prends de l''IceTea', '{}', false, null, null, null, now() - interval '2 hours 55 minutes'),
    (c_zamis, (u->>'camille')::uuid, '@Léa tu peux passer me chercher ?', array[(u->>'lea')::uuid], false, null, null, null, now() - interval '1 hour');

  -- Groupe "Escalade du jeudi" : Hugo est super admin, tu es simple membre
  insert into public.conversations (is_group, name, created_by, permissions) values (true, 'Escalade du jeudi', (u->>'hugo')::uuid, '{"mention_all":"admins"}')
    returning id into c_escalade;
  insert into public.members (conversation_id, user_id, role, joined_at) values
    (c_escalade, (u->>'hugo')::uuid, 'super_admin', now() - interval '10 days'),
    (c_escalade, me, 'member', now() - interval '9 days'),
    (c_escalade, (u->>'lea')::uuid, 'member', now() - interval '9 days'),
    (c_escalade, (u->>'antoine')::uuid, 'admin', now() - interval '9 days');
  insert into public.messages (conversation_id, author_id, content, mentions, pinned_at, pinned_until, pinned_by, created_at) values
    (c_escalade, (u->>'hugo')::uuid, 'Rappel : salle réservée jeudi 19h', '{}', now() - interval '2 days', null, (u->>'hugo')::uuid, now() - interval '2 days'),
    (c_escalade, (u->>'lea')::uuid, 'Je serai un peu en retard', '{}', null, null, null, now() - interval '30 hours'),
    (c_escalade, (u->>'hugo')::uuid, 'Qui a des chaussons en 42 à prêter ?', '{}', null, null, null, now() - interval '20 minutes');

  -- Groupe "Coloc" (sans message encore)
  insert into public.conversations (is_group, name, created_by, everyone_admin) values (true, 'Coloc', me, true) returning id into c_coloc;
  insert into public.members (conversation_id, user_id, role) values
    (c_coloc, me, 'super_admin'), (c_coloc, (u->>'antoine')::uuid, 'member'), (c_coloc, (u->>'camille')::uuid, 'member');

  -- Tout est lu sauf les derniers messages
  update public.members set last_read_at = now() - interval '2 hours' where user_id = me;

  raise notice 'OK ! Code ami de Tom (pour tester l''ajout) : %',
    (select friend_code from public.profiles where id = (u->>'tom')::uuid);
end $$;

-- Affiche le code de Tom
select display_name as "Ami à ajouter", friend_code as "Code" from public.profiles p
  join auth.users au on au.id = p.id where au.email = 'tom@test.leptigrp';
