-- =====================================================================
-- LePtiGrp - remplissage de la base et du stockage (vu par l'admin) + alerte push tous les 10 %.
-- Relançable sans risque. Prérequis : extras.sql (app_admins), push.sql (Vault push_secret), pg_cron.
-- =====================================================================

-- Limites du plan (plan gratuit Supabase : base 500 Mo, stockage 1 Go). À modifier ici si le plan change.
create or replace function public.usage_limits(out db_limit bigint, out storage_limit bigint)
language sql immutable as $$ select 500::bigint * 1024 * 1024, 1024::bigint * 1024 * 1024 $$;

-- Taille actuelle : base (pg_database_size) et fichiers (somme des tailles dans storage.objects)
create or replace function public.usage_now(out db_bytes bigint, out storage_bytes bigint)
language sql stable security definer set search_path = public as $$
  select pg_database_size(current_database()),
         coalesce((select sum((metadata->>'size')::bigint) from storage.objects), 0)
$$;
revoke all on function public.usage_now() from public, anon, authenticated;

-- Pour la page Paramètres : réservé aux admins
create or replace function public.app_usage()
returns table (db_bytes bigint, db_limit bigint, storage_bytes bigint, storage_limit bigint)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_app_admin() then raise exception 'Réservé à l''admin'; end if;
  return query select u.db_bytes, l.db_limit, u.storage_bytes, l.storage_limit from usage_now() u, usage_limits() l;
end $$;
revoke all on function public.app_usage() from public, anon;
grant execute on function public.app_usage() to authenticated;

-- Dernier palier notifié (0, 10, 20…) pour la base et le stockage
create table if not exists public.usage_alerts (
  kind      text primary key check (kind in ('db', 'storage')),
  last_step int not null default 0
);
alter table public.usage_alerts enable row level security;  -- aucune policy : invisible depuis l'appli

-- Toutes les heures : palier de 10 % franchi vers le haut → push à l'admin ; s'il redescend, on le mémorise aussi
create or replace function public.check_usage()
returns void language plpgsql security definer set search_path = public as $$
declare
  u record; l record; secret text; k text; pct numeric; step int; last int;
begin
  select * into u from usage_now();
  select * into l from usage_limits();
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'push_secret';
  foreach k in array array['db', 'storage'] loop
    pct := 100.0 * (case k when 'db' then u.db_bytes else u.storage_bytes end) / (case k when 'db' then l.db_limit else l.storage_limit end);
    step := least(floor(pct / 10) * 10, 100);
    insert into usage_alerts (kind) values (k) on conflict do nothing;
    select last_step into last from usage_alerts where kind = k;
    if step > last and secret is not null then
      perform net.http_post(
        url := 'https://jsxwhyhriyeizlnmiknf.supabase.co/functions/v1/push',
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', secret),
        body := jsonb_build_object('event', 'usage', 'kind', k, 'pct', round(pct))
      );
    end if;
    if step <> last then update usage_alerts set last_step = step where kind = k; end if;
  end loop;
end $$;
revoke execute on function public.check_usage() from public, anon, authenticated;

select cron.unschedule('check-usage') where exists (select 1 from cron.job where jobname = 'check-usage');
select cron.schedule('check-usage', '7 * * * *', 'select public.check_usage()');
