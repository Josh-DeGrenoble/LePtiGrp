-- LePtiGrp - comptes et sondages, suite :
--  * dépenses récurrentes (chaque semaine / mois / an, arrêtables)
--  * sondages modifiables (sauf réponses déjà votées), clôture maintenant ou programmée, dates réelles des sondages de dates
-- À lancer après tools.sql (relançable sans risque), puis security.sql.

-- ---------- Dépenses récurrentes ----------
alter table public.expenses add column if not exists repeat text check (repeat in ('week', 'month', 'year'));
alter table public.expenses add column if not exists repeat_until timestamptz;  -- arrêtée à cette date

-- ---------- Sondages ----------
alter table public.polls add column if not exists closes_at timestamptz;  -- clôture (passée = clôturé)
alter table public.polls add column if not exists dates date[];           -- sondage de dates : la date de chaque réponse

-- Plus de vote (ni de retrait de vote) après la clôture
create or replace function public.poll_closed_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if pg_trigger_depth() > 1 then return coalesce(new, old); end if;
  if exists (select 1 from polls where id = coalesce(new.poll_id, old.poll_id) and closes_at <= now()) then
    raise exception 'Ce sondage est clôturé';
  end if;
  return coalesce(new, old);
end $$;
revoke all on function public.poll_closed_guard() from public, anon, authenticated;
drop trigger if exists on_vote_closed on public.poll_votes;
create trigger on_vote_closed before insert or delete on public.poll_votes
  for each row execute function public.poll_closed_guard();

-- Modifier un sondage : opts = [{"from": ancien n° ou null, "text": "…"}, …] dans le nouvel ordre.
-- Une réponse déjà votée doit rester, avec le même texte ; les votes suivent leur réponse.
create or replace function public.edit_poll(p uuid, q text, opts jsonb, multi boolean, closes timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare pl polls; o jsonb; i int := 0; texts text[] := '{}'; ds date[] := '{}'; f int; kept int[] := '{}';
begin
  select * into pl from polls where id = p;
  if pl.id is null or not tool_access(pl.conversation_id, pl.participants) then raise exception 'Sondage introuvable'; end if;
  if not tool_right(pl.conversation_id, 'poll') then raise exception 'Tu n''as pas le droit de modifier ce sondage'; end if;
  if coalesce(trim(q), '') = '' or char_length(trim(q)) > 200 then raise exception 'Question invalide'; end if;
  for o in select * from jsonb_array_elements(opts) loop
    f := (o->>'from')::int;
    if f is not null then
      if f < 0 or f >= cardinality(pl.options) or f = any(kept) then raise exception 'Réponse inconnue'; end if;
      if exists (select 1 from poll_votes where poll_id = p and option = f) and trim(o->>'text') <> pl.options[f + 1] then
        raise exception 'La réponse « % » a déjà des votes : elle ne peut pas changer', pl.options[f + 1];
      end if;
      kept := kept || f;
    end if;
    if coalesce(trim(o->>'text'), '') = '' or char_length(trim(o->>'text')) > 80 then raise exception 'Réponse vide ou trop longue'; end if;
    texts := texts || trim(o->>'text');
    ds := ds || case when f is not null and pl.dates is not null then pl.dates[f + 1] else (o->>'date')::date end;
  end loop;
  if cardinality(texts) not between 2 and 31 then raise exception 'Entre 2 et 31 réponses'; end if;
  if exists (select 1 from poll_votes where poll_id = p and not (option = any(kept))) then
    raise exception 'Une réponse déjà votée ne peut pas être supprimée';
  end if;
  -- les votes suivent leur réponse (décalage temporaire pour éviter les doublons de clé)
  update poll_votes set option = option + 1000 where poll_id = p;
  i := 0;
  for o in select * from jsonb_array_elements(opts) loop
    f := (o->>'from')::int;
    if f is not null then update poll_votes set option = i where poll_id = p and option = f + 1000; end if;
    i := i + 1;
  end loop;
  update polls set question = trim(q), options = texts, multiple = coalesce(multi, multiple), closes_at = closes,
    dates = case when pl.dates is null then null else ds end
   where id = p;
end $$;
revoke all on function public.edit_poll(uuid, text, jsonb, boolean, timestamptz) from public, anon;
grant execute on function public.edit_poll(uuid, text, jsonb, boolean, timestamptz) to authenticated;

-- Clôturer maintenant (ou rouvrir avec null)
create or replace function public.close_poll(p uuid, at_ timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare pl polls;
begin
  select * into pl from polls where id = p;
  if pl.id is null or not tool_access(pl.conversation_id, pl.participants) then raise exception 'Sondage introuvable'; end if;
  if not tool_right(pl.conversation_id, 'poll') then raise exception 'Tu n''as pas le droit de clôturer ce sondage'; end if;
  update polls set closes_at = at_ where id = p;
end $$;
revoke all on function public.close_poll(uuid, timestamptz) from public, anon;
grant execute on function public.close_poll(uuid, timestamptz) to authenticated;
