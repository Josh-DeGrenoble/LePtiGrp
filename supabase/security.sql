-- =====================================================================
-- LePtiGrp - correctifs de sécurité (audit du 26/11). Relançable sans risque.
-- À lancer EN DERNIER, après tous les autres fichiers (et à relancer si l'un d'eux est relancé).
-- Prérequis : schema.sql, permissions.sql, tools.sql, account.sql (et activity.sql, cleanup.sql s'ils sont installés).
-- =====================================================================

-- ---------- 1. Rôles : un non-membre ne peut plus changer les rôles d'un groupe ----------
-- Avant : my_role() vaut NULL pour un non-membre, et « NULL <> 'super_admin' » sautait toute la vérification.
create or replace function public.set_member_role(conv uuid, member uuid, new_role text)
returns void language plpgsql security definer set search_path = public as $$
declare me_role text := public.my_role(conv); target text;
begin
  if me_role is null then raise exception 'Tu ne fais pas partie de ce groupe'; end if;
  if new_role not in ('super_admin', 'admin', 'member') then raise exception 'Rôle inconnu'; end if;
  if member = auth.uid() then raise exception 'Tu ne peux pas changer ton propre rôle'; end if;
  select role into target from members where conversation_id = conv and user_id = member;
  if target is null then raise exception 'Cette personne ne fait pas partie du groupe'; end if;
  if me_role <> 'super_admin' then
    if not public.can(conv, 'manage_admins') then raise exception 'Tu ne peux pas gérer les admins'; end if;
    if new_role = 'super_admin' or target = 'super_admin' then raise exception 'Réservé au super admin'; end if;
  end if;
  update members set role = new_role where conversation_id = conv and user_id = member;
end $$;

-- ---------- 2. Codes ami : 10 codes faux par heure maximum ----------
-- Avec 100 000 codes possibles, un script pouvait sinon devenir ami de tout le monde en quelques minutes.
create table if not exists public.friend_code_attempts (
  user_id uuid not null,
  at      timestamptz not null default now()
);
create index if not exists friend_code_attempts_idx on public.friend_code_attempts (user_id, at);
alter table public.friend_code_attempts enable row level security;  -- aucune policy : invisible depuis l'appli
revoke all on public.friend_code_attempts from anon, authenticated;

-- Un code inconnu ne lève plus d'erreur (elle annulerait l'enregistrement de la tentative) : la fonction renvoie vide.
create or replace function public.add_friend_by_code(code text)
returns public.profiles language plpgsql security definer set search_path = public as $$
declare p profiles; me uuid := auth.uid();
begin
  if me is null then raise exception 'Non connecté'; end if;
  delete from friend_code_attempts where at < now() - interval '1 day';
  if (select count(*) from friend_code_attempts where user_id = me and at > now() - interval '1 hour') >= 10 then
    raise exception 'Trop de codes faux : réessaie dans une heure.';
  end if;
  select * into p from profiles where friend_code = trim(code) and deleted_at is null;
  if p.id is null then
    insert into friend_code_attempts (user_id) values (me);
    return null;
  end if;
  if p.id = me then raise exception 'C''est ton propre code'; end if;
  insert into friendships (user_id, friend_id) values (me, p.id), (p.id, me) on conflict do nothing;
  return p;
end $$;

-- ---------- 3. Outils : on ne peut plus changer le propriétaire, la conv ou les participants ----------
-- Avant : un participant pouvait, via l'API, ajouter n'importe quel compte (même pas son ami) et lire son profil.
-- L'appli ne modifie que le nom, les catégories et le compte lié.
revoke update on public.lists, public.ledgers, public.polls from authenticated;
grant update (name, categories) on public.lists to authenticated;
grant update (name) on public.ledgers to authenticated;
grant update (question) on public.polls to authenticated;
-- liste liée à un compte (activity.sql) : le lien reste modifiable, le trigger on_list_ledger vérifie l'accès au compte
do $$ begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'lists' and column_name = 'ledger_id') then
    grant update (ledger_id) on public.lists to authenticated;  -- liste liée à un compte (activity.sql)
  end if;
end $$;

-- ---------- 4. Message de sondage : seulement un sondage de la même conv ----------
-- Avant : on pouvait accrocher n'importe quel sondage (et donc envoyer du texte en clair) à un message.
drop policy if exists "messages insert" on public.messages;
create policy "messages insert" on public.messages for insert to authenticated
  with check (author_id = auth.uid() and public.can(conversation_id, 'write')
              and (not mention_all or public.can(conversation_id, 'mention_all'))
              and pinned_at is null and pinned_until is null and pinned_by is null
              and (poll_id is null or exists (
                select 1 from public.polls p where p.id = poll_id and p.conversation_id = messages.conversation_id)));

-- ---------- 5. Votes : réponse existante, et une seule si le sondage est à choix unique ----------
create or replace function public.check_vote()
returns trigger language plpgsql security definer set search_path = public as $$
declare p polls;
begin
  select * into p from polls where id = new.poll_id;
  if new.option < 0 or new.option >= cardinality(p.options) then raise exception 'Réponse inconnue'; end if;
  -- choix unique : le nouveau vote remplace l'ancien (deux appuis rapides ne font pas deux votes)
  if not p.multiple then
    delete from poll_votes where poll_id = new.poll_id and user_id = new.user_id and option <> new.option;
  end if;
  return new;
end $$;
drop trigger if exists on_vote_check on public.poll_votes;
create trigger on_vote_check before insert on public.poll_votes
  for each row execute function public.check_vote();

-- ---------- 6. Fonctions internes : jamais appelables depuis l'appli ----------
-- (grants.sql et permissions.sql les rouvraient avec « grant execute on all functions »)
revoke execute on function public.send_due_reminders() from public, anon, authenticated;
revoke execute on function public.check_usage() from public, anon, authenticated;
revoke execute on function public.usage_now() from public, anon, authenticated;
do $$ begin
  if to_regprocedure('public.log_activity(uuid, text, uuid, text, text)') is not null then
    revoke execute on function public.log_activity(uuid, text, uuid, text, text) from public, anon, authenticated;
  end if;
  -- cleanup.sql : sinon n'importe qui pouvait effacer les photos d'une conv dont il connaît l'id
  if to_regprocedure('public.purge_media(uuid)') is not null then
    revoke execute on function public.purge_media(uuid) from public, anon, authenticated;
  end if;
end $$;

-- ---------- 7. « Supprimer la conversation » : heure du serveur, pas celle du téléphone ----------
-- Avec l'heure du téléphone (en retard, ou mise dans le futur exprès), la conv à deux pouvait rester
-- ou être supprimée pour de bon (cleanup.sql) alors que l'autre écrivait encore.
create or replace function public.hidden_at_now()
returns trigger language plpgsql as $$
begin
  if new.hidden_at is not null and new.hidden_at is distinct from old.hidden_at then new.hidden_at := now(); end if;
  return new;
end $$;
drop trigger if exists on_member_hidden_at on public.members;
create trigger on_member_hidden_at before update of hidden_at on public.members
  for each row execute function public.hidden_at_now();
