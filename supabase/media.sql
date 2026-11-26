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
