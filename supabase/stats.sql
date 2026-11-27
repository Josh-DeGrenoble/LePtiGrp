-- =====================================================================
-- LePtiGrp - statistiques pour l'espace admin (compteurs seulement, jamais de contenu).
-- Relançable sans risque. Prérequis : extras.sql (is_app_admin). Les outils non installés comptent 0.
-- =====================================================================

-- Nombre de lignes d'une table (0 si elle n'existe pas), avec un filtre facultatif
create or replace function public.stat_count(tbl text, cond text default 'true')
returns bigint language plpgsql stable security definer set search_path = public as $$
declare n bigint;
begin
  if not public.is_app_admin() then raise exception 'Réservé à l''admin'; end if;
  if to_regclass('public.' || tbl) is null then return 0; end if;
  execute format('select count(*) from public.%I where %s', tbl, cond) into n;
  return n;
end $$;
revoke all on function public.stat_count(text, text) from public, anon, authenticated;

create or replace function public.app_stats()
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
declare r jsonb;
begin
  if not public.is_app_admin() then raise exception 'Réservé à l''admin'; end if;
  select jsonb_build_object(
    -- Comptes
    'users',          (select count(*) from profiles where deleted_at is null),
    'users_deleted',  (select count(*) from profiles where deleted_at is not null),
    'users_new_7d',   (select count(*) from profiles where deleted_at is null and created_at > now() - interval '7 days'),
    'active_1d',      (select count(*) from auth.users where last_sign_in_at > now() - interval '1 day'),
    'writers_7d',     (select count(distinct author_id) from messages where created_at > now() - interval '7 days' and kind is distinct from 'activity'),
    'writers_30d',    (select count(distinct author_id) from messages where created_at > now() - interval '30 days' and kind is distinct from 'activity'),
    'push_users',     (select count(distinct user_id) from push_subscriptions),
    'friendships',    (select count(*) / 2 from friendships),
    'circles',        public.stat_count('friend_circles'),
    -- Discussions
    'groups',         (select count(*) from conversations where is_group),
    'dms',            (select count(*) from conversations where not is_group),
    'avg_group_size', (select round(avg(n), 1) from (select count(*) n from members m join conversations c on c.id = m.conversation_id where c.is_group group by m.conversation_id) s),
    'biggest_group',  (select max(n) from (select count(*) n from members m join conversations c on c.id = m.conversation_id where c.is_group group by m.conversation_id) s),
    -- Messages
    'messages',       (select count(*) from messages where kind is distinct from 'activity'),
    'messages_24h',   (select count(*) from messages where kind is distinct from 'activity' and created_at > now() - interval '1 day'),
    'messages_7d',    (select count(*) from messages where kind is distinct from 'activity' and created_at > now() - interval '7 days'),
    'photos',         (select count(*) from messages where has_media),
    'pinned',         (select count(*) from messages where pinned_at is not null and (pinned_until is null or pinned_until > now())),
    'activity',       (select count(*) from messages where kind = 'activity'),
    'reactions',      public.stat_count('message_reactions'),
    -- 14 derniers jours : messages par jour (du plus ancien au plus récent)
    'per_day',        (select jsonb_agg(coalesce(c, 0) order by d) from generate_series(current_date - 13, current_date, interval '1 day') d
                         left join (select created_at::date dd, count(*) c from messages where kind is distinct from 'activity' and created_at > current_date - 14 group by 1) x on x.dd = d::date),
    -- Outils
    'lists',          public.stat_count('lists'),
    'list_items',     public.stat_count('list_items'),
    'ledgers',        public.stat_count('ledgers'),
    'expenses',       public.stat_count('expenses'),
    'polls',          public.stat_count('polls'),
    'votes',          public.stat_count('poll_votes'),
    'events',         public.stat_count('events'),
    'events_coming',  public.stat_count('events', 'day >= current_date'),
    'reminders',      public.stat_count('reminders', 'sent_at is null'),
    'feedback',       public.stat_count('feedback')
  ) into r;
  return r;
end $$;
revoke all on function public.app_stats() from public, anon;
grant execute on function public.app_stats() to authenticated;
