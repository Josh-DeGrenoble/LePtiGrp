-- Photos chiffrées de bout en bout (bucket privé « media »)
-- Le serveur ne stocke que des fichiers chiffrés : la clé de chaque photo est dans le message chiffré.

alter table public.messages add column if not exists has_media boolean not null default false;
create index if not exists messages_media_idx on public.messages (conversation_id, created_at desc) where has_media;

insert into storage.buckets (id, name, public, file_size_limit)
values ('media', 'media', false, 5242880)
on conflict (id) do update set public = false, file_size_limit = 5242880;

-- Chemin : <conversation_id>/<client_id>
create or replace function public.media_conv(name text) returns uuid
language sql immutable as $$
  select case when (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$' then ((storage.foldername(name))[1])::uuid end
$$;

drop policy if exists "media read members" on storage.objects;
drop policy if exists "media insert members" on storage.objects;
drop policy if exists "media update own" on storage.objects;
drop policy if exists "media delete own" on storage.objects;
create policy "media read members" on storage.objects for select to authenticated
  using (bucket_id = 'media' and public.is_member(public.media_conv(name)));
create policy "media insert members" on storage.objects for insert to authenticated
  with check (bucket_id = 'media' and public.is_member(public.media_conv(name)));
create policy "media update own" on storage.objects for update to authenticated
  using (bucket_id = 'media' and owner_id = auth.uid()::text and public.is_member(public.media_conv(name)));
create policy "media delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'media' and owner_id = auth.uid()::text);

-- ---------- Garde-fou des clés de conversation (audit sécurité) -------------------
-- Une nouvelle epoch doit suivre la précédente (max + 1), être signée par une clé publiée de son auteur
-- et contenir la clé actuelle de chaque membre qui en a une : un membre ne peut plus casser le chiffrement des autres.
-- En cas de refus : code 23505, l'appli recharge les membres et réessaie.
create or replace function public.conv_epochs_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  last int;
  want int;
  ok int;
begin
  perform pg_advisory_xact_lock(hashtext(new.conversation_id::text));
  select coalesce(max(epoch), 0) into last from conv_epochs where conversation_id = new.conversation_id;
  if new.epoch <> last + 1 then
    raise exception 'epoch % attendue', last + 1 using errcode = '23505';
  end if;
  if not exists (select 1 from user_keys where user_id = new.created_by and sign_pk = new.signer_pk) then
    raise exception 'clé de signature inconnue' using errcode = '42501';
  end if;
  if jsonb_typeof(new.keys) <> 'object' then
    raise exception 'clés invalides' using errcode = '22023';
  end if;
  with cur as (
    select distinct on (k.user_id) k.user_id, k.box_pk
    from members m join user_keys k on k.user_id = m.user_id
    where m.conversation_id = new.conversation_id
    order by k.user_id, k.created_at desc
  )
  select count(*), count(*) filter (where new.keys -> (cur.user_id::text) ->> 'pk' = cur.box_pk) into want, ok from cur;
  if ok <> want or want <> (select count(*) from jsonb_object_keys(new.keys)) then
    raise exception 'clés incomplètes pour les membres actuels' using errcode = '23505';
  end if;
  return new;
end $$;
drop trigger if exists conv_epochs_guard on public.conv_epochs;
create trigger conv_epochs_guard before insert on public.conv_epochs for each row execute function public.conv_epochs_guard();
