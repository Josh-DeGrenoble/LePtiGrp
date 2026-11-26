-- LePtiGrp - activité des outils dans le chat + pense-bête lié à un compte
-- À lancer après tools.sql, e2ee.sql et push.sql (relançable sans risque).
--
-- Quand un pense-bête, un compte ou un sondage est rattaché à une conv, chaque modif
-- (élément ajouté / coché / supprimé, prise, dépense, vote) écrit un message « activité »
-- dans la conv. Les modifs d'une même personne sur le même outil sont regroupées dans
-- un seul message tant qu'elles se suivent (moins de 10 min, rien entre deux) : une seule notif.
-- Ces messages sont en clair, comme les outils eux-mêmes (pas encore chiffrés).

-- ---------- Pense-bête lié à un compte --------------------------------
alter table public.lists add column if not exists ledger_id uuid references public.ledgers on delete set null;

create or replace function public.check_list_ledger()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.ledger_id is not null and new.ledger_id is distinct from old.ledger_id and not can_access_ledger(new.ledger_id) then
    raise exception 'Compte introuvable';
  end if;
  return new;
end $$;
drop trigger if exists on_list_ledger on public.lists;
create trigger on_list_ledger before insert or update of ledger_id on public.lists
  for each row execute function public.check_list_ledger();

-- ---------- Réglages : afficher / notifier l'activité ----------------
-- Par outil ('list' pense-bêtes, 'poll' sondages, 'ledger' comptes) : « Chat » (show_tools) et « Notif » (notify_tools).
-- Par conv (vide = réglage par défaut du profil). Par défaut : rien dans le chat, tout en notif.
drop function if exists public.my_conversations();
alter table public.members drop column if exists show_activity;
alter table public.profiles drop column if exists show_activity_default;
alter table public.members drop column if exists notify_activity;
alter table public.profiles drop column if exists notify_activity_default;
alter table public.members add column if not exists show_tools text[];
alter table public.members add column if not exists notify_tools text[];
alter table public.profiles add column if not exists show_tools_default text[] not null default '{}';
alter table public.profiles add column if not exists notify_tools_default text[] not null default '{list,poll,ledger}';
grant update (show_tools, notify_tools) on public.members to authenticated;
grant update (show_tools_default, notify_tools_default) on public.profiles to authenticated;

-- ---------- Messages d'activité ---------------------------------------
alter table public.messages add column if not exists kind text not null default 'msg';
alter table public.messages drop constraint if exists messages_kind_check;
alter table public.messages add constraint messages_kind_check check (kind in ('msg', 'activity'));
alter table public.messages add column if not exists tool text check (tool in ('list', 'ledger', 'poll'));
alter table public.messages add column if not exists tool_id uuid;
alter table public.messages add column if not exists tool_name text;

-- Chiffrement obligatoire, sauf cartes de sondage et messages d'activité écrits par le serveur
create or replace function public.messages_require_e2ee()
returns trigger language plpgsql as $$
begin
  if new.kind = 'activity' then
    if coalesce(current_setting('leptigrp.activity', true), '') <> 'on' then
      raise exception 'Message d''activité réservé au serveur';
    end if;
    return new;
  end if;
  if new.ciphertext is null and new.poll_id is null then
    raise exception 'Les messages doivent être chiffrés : mets l''appli à jour';
  end if;
  return new;
end $$;

-- Ajoute une ligne d'activité (regroupée avec mon dernier message d'activité si possible)
create or replace function public.log_activity(conv uuid, kind_ text, tool_ uuid, name_ text, line text)
returns void language plpgsql security definer set search_path = public as $$
declare
  me uuid := auth.uid();
  last messages;
  lines text[];
begin
  if conv is null or me is null or line is null then return; end if;
  if not exists (select 1 from members where conversation_id = conv and user_id = me) then return; end if;
  select * into last from messages where conversation_id = conv order by created_at desc, id desc limit 1;
  if last.kind = 'activity' and last.author_id = me and last.tool_id = tool_ and last.created_at > now() - interval '10 minutes' then
    lines := string_to_array(last.content, E'\n');
    if lines[array_length(lines, 1)] = line then return; end if;
    lines := (lines || line)[greatest(1, array_length(lines, 1) - 10):];
    update messages set content = left(array_to_string(lines, E'\n'), 4000), created_at = now(), tool_name = name_
     where id = last.id;
    update conversations set last_message_at = now() where id = conv;
  else
    perform set_config('leptigrp.activity', 'on', true);
    insert into messages (conversation_id, author_id, content, kind, tool, tool_id, tool_name, mentions, mention_all)
    values (conv, me, line, 'activity', kind_, tool_, name_, '{}', false);
    perform set_config('leptigrp.activity', '', true);
  end if;
end $$;
revoke all on function public.log_activity(uuid, text, uuid, text, text) from public, anon, authenticated;

create or replace function public.fmt_eur(x numeric)
returns text language sql immutable as $$ select replace(to_char(x, 'FM999999990.00'), '.', ',') || ' €' $$;

-- Pense-bête : éléments ajoutés, cochés, supprimés
create or replace function public.activity_list_item()
returns trigger language plpgsql security definer set search_path = public as $$
declare l lists; r list_items := coalesce(new, old); line text;
begin
  select * into l from lists where id = r.list_id;
  if l.conversation_id is null then return null; end if;
  line := case
    when tg_op = 'INSERT' then '+ ' || r.content || coalesce(' (' || nullif(r.quantity, '') || ')', '')
    when tg_op = 'DELETE' then '− ' || r.content
    when new.checked and not old.checked then '✓ ' || r.content
    when old.checked and not new.checked then '↺ ' || r.content
    when new.content <> old.content then '✎ ' || old.content || ' → ' || new.content
  end;
  perform log_activity(l.conversation_id, 'list', l.id, l.name, line);
  return null;
end $$;
drop trigger if exists on_list_item_activity on public.list_items;
create trigger on_list_item_activity after insert or delete or update of checked, content on public.list_items
  for each row execute function public.activity_list_item();

-- Pense-bête : « je prends »
create or replace function public.activity_claim()
returns trigger language plpgsql security definer set search_path = public as $$
declare l lists; i list_items; r list_claims := coalesce(new, old);
begin
  select * into i from list_items where id = r.item_id;
  if i.id is null then return null; end if;  -- élément supprimé (cascade)
  select * into l from lists where id = i.list_id;
  if l.conversation_id is null then return null; end if;
  perform log_activity(l.conversation_id, 'list', l.id, l.name, case
    when tg_op = 'DELETE' then 'ne prend plus ' || i.content
    else 'prend ' || i.content || coalesce(' (' || trim_scale(r.qty)::text || ')', '') end);
  return null;
end $$;
drop trigger if exists on_claim_activity on public.list_claims;
create trigger on_claim_activity after insert or delete on public.list_claims
  for each row execute function public.activity_claim();

-- Comptes : dépenses
create or replace function public.activity_expense()
returns trigger language plpgsql security definer set search_path = public as $$
declare g ledgers; r expenses := coalesce(new, old);
begin
  select * into g from ledgers where id = r.ledger_id;
  if g.conversation_id is null then return null; end if;
  perform log_activity(g.conversation_id, 'ledger', g.id, g.name, case tg_op
    when 'INSERT' then '💶 ' || r.label || ' : ' || fmt_eur(r.amount)
    when 'DELETE' then '− ' || r.label || ' (' || fmt_eur(r.amount) || ')'
    else '✎ ' || new.label || ' : ' || fmt_eur(new.amount) end);
  return null;
end $$;
drop trigger if exists on_expense_activity on public.expenses;
create trigger on_expense_activity after insert or delete or update of label, amount, paid_by, split on public.expenses
  for each row execute function public.activity_expense();

-- Sondages : votes
create or replace function public.activity_vote()
returns trigger language plpgsql security definer set search_path = public as $$
declare p polls;
begin
  select * into p from polls where id = new.poll_id;
  if p.conversation_id is null then return null; end if;
  perform log_activity(p.conversation_id, 'poll', p.id, p.question, 'a voté « ' || coalesce(p.options[new.option + 1], '?') || ' »');
  return null;
end $$;
drop trigger if exists on_vote_activity on public.poll_votes;
create trigger on_vote_activity after insert on public.poll_votes
  for each row execute function public.activity_vote();

-- ---------- Liste des convs : l'activité masquée ne compte pas -------
create function public.my_conversations()
returns table (
  id uuid, is_group boolean, name text, avatar_url text, other_user_id uuid,
  is_favorite boolean, notify_all boolean, notify_mentions boolean, notify_pins boolean,
  last_message_at timestamptz, last_content text, last_author text, unread int,
  last_ciphertext text, last_epoch int, last_author_id uuid, last_client_id uuid,
  show_tools text[], notify_tools text[], last_kind text)
language sql stable security definer set search_path = public as $$
  select c.id, c.is_group,
         case when c.is_group then c.name else op.display_name end,
         case when c.is_group then c.avatar_url else op.avatar_url end,
         op.id,
         m.is_favorite, m.notify_all, m.notify_mentions, m.notify_pins,
         c.last_message_at, lm.content, la.display_name,
         (select count(*)::int from messages x where x.conversation_id = c.id
             and x.created_at > m.last_read_at and x.author_id <> auth.uid()
             and (x.kind = 'msg' or x.tool = any(sa.v))),
         lm.ciphertext, lm.epoch, lm.author_id, lm.client_id,
         m.show_tools, m.notify_tools, lm.kind
    from members m
    join conversations c on c.id = m.conversation_id
    join profiles me on me.id = m.user_id
    cross join lateral (select coalesce(m.show_tools, me.show_tools_default) as v) sa
    left join lateral (
      select p.* from members o join profiles p on p.id = o.user_id
       where not c.is_group and o.conversation_id = c.id and o.user_id <> auth.uid() limit 1) op on true
    left join lateral (
      select * from messages x where x.conversation_id = c.id
         and (m.hidden_at is null or x.created_at > m.hidden_at)
         and (x.kind = 'msg' or x.tool = any(sa.v))
       order by x.created_at desc limit 1) lm on true
    left join profiles la on la.id = lm.author_id
   where m.user_id = auth.uid()
     and (m.hidden_at is null or c.last_message_at > m.hidden_at)
   order by m.is_favorite desc, c.last_message_at desc;
$$;
grant execute on function public.my_conversations() to authenticated;
