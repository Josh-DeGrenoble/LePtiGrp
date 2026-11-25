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
