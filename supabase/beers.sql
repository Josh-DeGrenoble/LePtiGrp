-- LePtiGrp - compteur de bières dues au dev (clics sur « Payer un café au dev »)
-- À lancer après extras.sql (relançable sans risque), puis relancer security.sql.

create table if not exists public.beers (
  user_id uuid primary key references public.profiles on delete cascade,
  count int not null default 0,
  last_at timestamptz not null default now()
);
alter table public.beers enable row level security;
revoke all on public.beers from anon, authenticated;

-- Un clic = une bière de plus ; renvoie mon total
create or replace function public.owe_beer()
returns int language sql security definer set search_path = public as $$
  insert into beers (user_id, count) values (auth.uid(), 1)
  on conflict (user_id) do update set count = beers.count + 1, last_at = now()
  returning count;
$$;
revoke all on function public.owe_beer() from public, anon;
grant execute on function public.owe_beer() to authenticated;

-- Admin : qui me doit combien
create or replace function public.beer_board()
returns table (user_id uuid, display_name text, count int, last_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_app_admin() then raise exception 'Réservé aux admins'; end if;
  return query select b.user_id, p.display_name, b.count, b.last_at
    from beers b join profiles p on p.id = b.user_id order by b.count desc, b.last_at desc;
end $$;
revoke all on function public.beer_board() from public, anon;
grant execute on function public.beer_board() to authenticated;

-- Admin : une bière payée = une de moins (la ligne disparaît à 0) ; renvoie le nouveau total
create or replace function public.beer_paid(who uuid)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not is_app_admin() then raise exception 'Réservé aux admins'; end if;
  update beers set count = count - 1 where user_id = who returning count into n;
  if n is not null and n <= 0 then delete from beers where user_id = who; n := 0; end if;
  return coalesce(n, 0);
end $$;
revoke all on function public.beer_paid(uuid) from public, anon;
grant execute on function public.beer_paid(uuid) to authenticated;
