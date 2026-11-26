-- =====================================================================
-- LePtiGrp - notifications push et envoi hors-ligne
-- Prérequis : avoir lancé le fichier de secret (secret "push_secret" dans le Vault).
-- =====================================================================

-- Identifiant généré par le téléphone : un message renvoyé après une coupure n'est jamais dupliqué
alter table public.messages add column if not exists client_id uuid unique;

-- Abonnements push (un par appareil)
create table if not exists public.push_subscriptions (
  endpoint   text primary key,
  user_id    uuid not null default auth.uid() references public.profiles on delete cascade,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
drop policy if exists "push own" on public.push_subscriptions;
create policy "push own" on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- Appel de la fonction d'envoi à chaque nouveau message ou épinglage
create extension if not exists pg_net;

create or replace function public.notify_push()
returns trigger language plpgsql security definer set search_path = public as $$
declare secret text;
begin
  -- épinglage : seulement quand un message non épinglé vient de l'être (pas quand on change la durée)
  if tg_op = 'UPDATE' and (new.pinned_at is null or old.pinned_at is not null) then
    return new;
  end if;
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'push_secret';
  if secret is null then return new; end if;
  perform net.http_post(
    url := 'https://jsxwhyhriyeizlnmiknf.supabase.co/functions/v1/push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', secret),
    body := jsonb_build_object('event', case when tg_op = 'INSERT' then 'message' else 'pin' end, 'message_id', new.id)
  );
  return new;
end $$;

drop trigger if exists on_message_push on public.messages;
create trigger on_message_push
  after insert or update of pinned_at on public.messages
  for each row execute function public.notify_push();

-- Enregistrer l'abonnement de ce téléphone pour moi, même s'il appartenait à un autre compte
-- (plusieurs comptes testés sur le même téléphone : sinon l'abonnement reste à l'ancien compte)
create or replace function public.save_push_subscription(endpoint text, p256dh text, auth text)
returns void language sql security definer set search_path = public as $$
  insert into push_subscriptions (endpoint, user_id, p256dh, auth) values (endpoint, auth.uid(), p256dh, auth)
  on conflict (endpoint) do update set user_id = auth.uid(), p256dh = excluded.p256dh, auth = excluded.auth
$$;
revoke all on function public.save_push_subscription(text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text) to authenticated;
