-- Droits d'accès de l'appli aux tables (la sécurité ligne par ligne reste assurée par les règles RLS).
-- Nécessaire sur les projets Supabase qui n'exposent pas automatiquement les nouvelles tables.
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema public to authenticated;

-- Colonnes modifiables uniquement
revoke update on public.profiles, public.members from authenticated;
grant update (display_name, avatar_url) on public.profiles to authenticated;
grant update (is_favorite, notify_all, notify_mentions, notify_pins, hidden_at, last_read_at) on public.members to authenticated;

-- Fonctions internes (cron) et colonnes figées des outils : à refermer après le « grant » ci-dessus (voir security.sql)
do $$
declare f text;
begin
  foreach f in array array['public.send_due_reminders()', 'public.check_usage()', 'public.usage_now()',
                         'public.log_activity(uuid, text, uuid, text, text)'] loop
    if to_regprocedure(f) is not null then execute format('revoke execute on function %s from public, anon, authenticated', f); end if;
  end loop;
  if to_regclass('public.lists') is not null then
    revoke update on public.lists, public.ledgers, public.polls from authenticated;
    grant update (name, categories) on public.lists to authenticated;
    grant update (name) on public.ledgers to authenticated;
    grant update (question) on public.polls to authenticated;
  end if;
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'lists' and column_name = 'ledger_id') then
    grant update (ledger_id) on public.lists to authenticated;  -- liste liée à un compte (activity.sql)
  end if;
  -- réglages de l'activité des outils (activity.sql)
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'members' and column_name = 'show_tools') then
    grant update (show_tools, notify_activity) on public.members to authenticated;
    grant update (show_tools_default, notify_activity_default) on public.profiles to authenticated;
  end if;
end $$;
