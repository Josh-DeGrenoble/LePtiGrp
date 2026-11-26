-- LePtiGrp - SUPPRIMER TOUS LES COMPTES SAUF CEUX LISTÉS (IRRÉVERSIBLE)
-- Supprime les comptes (auth + profil, y compris les « Compte supprimé ») et tout ce qui leur est lié :
-- messages, dépenses, prises, votes, outils, rappels, amitiés, clés, abonnements notifs.
-- Conversations : supprimées si plus aucun compte gardé n'y est, et les conversations à deux avec un compte supprimé.
-- Après : vider dans Storage les dossiers « media » des conversations supprimées (ou tout le bucket).

-- 1) VÉRIFIER D'ABORD : comptes gardés / supprimés (remplace les 2 identifiants ci-dessous)
select p.id, p.display_name, u.email, u.created_at,
       p.id in ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000') as garde
  from public.profiles p left join auth.users u on u.id = p.id
 order by garde desc, u.created_at;

-- 2) SUPPRIMER (mêmes identifiants)
do $$
declare
  keep uuid[] := array['00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000']::uuid[];
  gone uuid[];
  fk record;
  pass int;
  left_ int;
begin
  if (select count(*) from public.profiles where id = any(keep)) <> array_length(keep, 1) then
    raise exception 'Un des comptes à garder est introuvable : vérifie les identifiants';
  end if;
  select array_agg(id) into gone from (
    select id from public.profiles where not (id = any(keep))
    union select id from auth.users where not (id = any(keep))) x;
  if gone is null then raise notice 'Rien à supprimer'; return; end if;

  -- conversations sans compte gardé, et conversations à deux avec un compte supprimé
  delete from public.conversations c
   where not exists (select 1 from public.members m where m.conversation_id = c.id and m.user_id = any(keep))
      or (not c.is_group and exists (select 1 from public.members m where m.conversation_id = c.id and m.user_id = any(gone)));

  -- toutes les lignes qui pointent vers un compte supprimé (plusieurs passes à cause des dépendances)
  for pass in 1..6 loop
    left_ := 0;
    for fk in
      select cl.relname as tbl, a.attname as col
        from pg_constraint k
        join pg_class cl on cl.oid = k.conrelid join pg_namespace n on n.oid = cl.relnamespace
        join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
       where k.contype = 'f' and n.nspname = 'public' and array_length(k.conkey, 1) = 1
         and k.confrelid in ('public.profiles'::regclass, 'auth.users'::regclass)
         and cl.relname <> 'profiles'
    loop
      begin
        execute format('delete from public.%I where %I = any($1)', fk.tbl, fk.col) using gone;
      exception when foreign_key_violation then left_ := left_ + 1;
      end;
    end loop;
    exit when left_ = 0;
  end loop;

  delete from public.profiles where id = any(gone);
  delete from auth.users where id = any(gone);
  raise notice 'Comptes supprimés : %. Restants : %', array_length(gone, 1), (select count(*) from public.profiles);
end $$;
