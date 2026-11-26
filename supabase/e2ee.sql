-- =====================================================================
-- LePtiGrp - chiffrement de bout en bout des messages (relançable sans risque)
-- Le serveur ne stocke que des clés PUBLIQUES et des clés de conversation scellées :
-- il ne peut lire aucun message chiffré.
-- =====================================================================

-- ---------- Clés publiques des comptes ---------------------------------
-- Une ligne par clé : un compte qui repart de zéro (phrase perdue) ajoute une ligne, sans effacer l'historique.
-- Les téléphones des amis gardent la liste des clés vues : une nouvelle clé déclenche une alerte.
create table if not exists public.user_keys (
  user_id    uuid not null default auth.uid() references public.profiles on delete cascade,
  sign_pk    text not null,   -- Ed25519 (signature des messages)
  box_pk     text not null,   -- X25519 (réception des clés de conversation)
  created_at timestamptz not null default now(),
  primary key (user_id, sign_pk)
);
alter table public.user_keys enable row level security;
drop policy if exists "keys read" on public.user_keys;
create policy "keys read" on public.user_keys for select to authenticated using (true);
drop policy if exists "keys add" on public.user_keys;
create policy "keys add" on public.user_keys for insert to authenticated with check (user_id = auth.uid());
-- Ni modification ni suppression : l'historique des clés sert à vérifier les anciens messages
revoke update, delete on public.user_keys from authenticated;
grant select, insert on public.user_keys to authenticated;

-- ---------- Clés de conversation --------------------------------------
-- Chaque « epoch » = une clé aléatoire, scellée pour chaque membre (keys = {user_id: {pk, k}}),
-- signée par son créateur. Nouvelle epoch à chaque arrivée / départ d'un membre.
create table if not exists public.conv_epochs (
  conversation_id uuid not null references public.conversations on delete cascade,
  epoch           int  not null check (epoch >= 1),
  created_by      uuid not null default auth.uid(),
  signer_pk       text not null,
  keys            jsonb not null,
  sig             text not null,
  created_at      timestamptz not null default now(),
  primary key (conversation_id, epoch)
);
alter table public.conv_epochs enable row level security;
drop policy if exists "epochs read" on public.conv_epochs;
create policy "epochs read" on public.conv_epochs for select to authenticated using (public.is_member(conversation_id));
drop policy if exists "epochs add" on public.conv_epochs;
create policy "epochs add" on public.conv_epochs for insert to authenticated
  with check (created_by = auth.uid() and public.is_member(conversation_id));
revoke update, delete on public.conv_epochs from authenticated;
grant select, insert on public.conv_epochs to authenticated;

-- ---------- Messages chiffrés -----------------------------------------
alter table public.messages add column if not exists epoch int;
alter table public.messages add column if not exists ciphertext text;
alter table public.messages alter column content drop not null;
alter table public.messages drop constraint if exists messages_content_check;
alter table public.messages add constraint messages_content_check check (
  (ciphertext is null and content is not null and length(content) between 1 and 4000)
  or (ciphertext is not null and content is null and epoch is not null and client_id is not null and length(ciphertext) <= 24000)
);

-- Plus aucun nouveau message en clair (sauf la carte d'un sondage, qui ne contient que son titre)
create or replace function public.messages_require_e2ee()
returns trigger language plpgsql as $$
begin
  if new.ciphertext is null and new.poll_id is null then
    raise exception 'Les messages doivent être chiffrés : mets l''appli à jour';
  end if;
  return new;
end $$;
drop trigger if exists messages_require_e2ee on public.messages;
create trigger messages_require_e2ee before insert on public.messages
  for each row execute function public.messages_require_e2ee();

-- Liste des convs : le dernier message est renvoyé chiffré, le téléphone le déchiffre
drop function if exists public.my_conversations();
create function public.my_conversations()
returns table (
  id uuid, is_group boolean, name text, avatar_url text, other_user_id uuid,
  is_favorite boolean, notify_all boolean, notify_mentions boolean, notify_pins boolean,
  last_message_at timestamptz, last_content text, last_author text, unread int,
  last_ciphertext text, last_epoch int, last_author_id uuid, last_client_id uuid)
language sql stable security definer set search_path = public as $$
  select c.id, c.is_group,
         case when c.is_group then c.name else op.display_name end,
         case when c.is_group then c.avatar_url else op.avatar_url end,
         op.id,
         m.is_favorite, m.notify_all, m.notify_mentions, m.notify_pins,
         c.last_message_at, lm.content, la.display_name,
         (select count(*)::int from messages x where x.conversation_id = c.id
             and x.created_at > m.last_read_at and x.author_id <> auth.uid()),
         lm.ciphertext, lm.epoch, lm.author_id, lm.client_id
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
grant execute on function public.my_conversations() to authenticated;

-- ---------- Facultatif : effacer les anciens messages en clair ----------
-- Les messages d'avant le chiffrement restent lisibles et sont marqués « non chiffré » dans l'appli.
-- Pour les supprimer définitivement (données de test comprises), enlève les deux tirets et relance :
-- delete from public.messages where ciphertext is null and poll_id is null;
