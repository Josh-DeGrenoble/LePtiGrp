-- LePtiGrp - droits sur les outils d'un groupe (pense-bêtes, comptes, sondages, calendrier)
-- Réglables dans les paramètres du groupe : Tous / Admins / Super (par défaut : Tous).
-- « Gérer » = créer, renommer, supprimer l'outil et modifier son contenu (éléments d'un pense-bête,
-- dépenses, événement). Restent ouverts à tous les membres : cocher / prendre, voter, répondre à un événement.
-- À lancer après tools.sql et calendar.sql (relançable sans risque), puis security.sql.

create or replace function public.tool_right(conv uuid, kind text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare c conversations; r text; lvl text;
begin
  if conv is null then return true; end if;                 -- outil perso ou « avec des amis »
  select * into c from conversations where id = conv;
  if c.id is null or not c.is_group then return true; end if;  -- conv à deux : pas de droits
  r := my_role(conv);
  if r is null then return false; end if;
  if r = 'super_admin' then return true; end if;
  lvl := coalesce(c.permissions->>('tool_' || kind), 'all');
  return lvl = 'all' or (lvl = 'admins' and r = 'admin');
end $$;
revoke all on function public.tool_right(uuid, text) from public, anon;
grant execute on function public.tool_right(uuid, text) to authenticated;

-- Contrôle à chaque modif faite par un membre (pas lors des suppressions en cascade : pg_trigger_depth() > 1)
create or replace function public.guard_tool()
returns trigger language plpgsql security definer set search_path = public as $$
declare r jsonb := to_jsonb(coalesce(new, old)); conv uuid; kind text := tg_argv[0];
begin
  if pg_trigger_depth() > 1 or auth.uid() is null then return coalesce(new, old); end if;
  if tg_table_name = 'list_items' then conv := (select conversation_id from lists where id = (r->>'list_id')::uuid);
  elsif tg_table_name = 'expenses' then conv := (select conversation_id from ledgers where id = (r->>'ledger_id')::uuid);
  else conv := (r->>'conversation_id')::uuid; end if;
  -- pense-bête : cocher, le niveau « restant » et l'ordre restent libres
  if tg_table_name = 'list_items' and tg_op = 'UPDATE' then
    if (to_jsonb(new) - array['checked', 'checked_by', 'level', 'position']) = (to_jsonb(old) - array['checked', 'checked_by', 'level', 'position']) then
      return new;
    end if;
  end if;
  if not tool_right(conv, kind) then
    raise exception 'Seuls les % de ce groupe peuvent modifier ça',
      case (select coalesce(permissions->>('tool_' || kind), 'all') from conversations where id = conv) when 'super' then 'super admins' else 'admins' end;
  end if;
  return coalesce(new, old);
end $$;
revoke all on function public.guard_tool() from public, anon, authenticated;

do $$
declare t text[];
begin
  foreach t slice 1 in array array[['lists', 'list'], ['list_items', 'list'], ['ledgers', 'ledger'], ['expenses', 'ledger'],
                                   ['polls', 'poll'], ['events', 'event']] loop
    if to_regclass('public.' || t[1]) is not null then
      execute format('drop trigger if exists guard_tool on public.%I', t[1]);
      execute format('create trigger guard_tool before insert or update or delete on public.%I for each row execute function public.guard_tool(%L)', t[1], t[2]);
    end if;
  end loop;
end $$;
