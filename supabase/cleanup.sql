-- LePtiGrp - suppression des conversations et de toutes leurs données
-- À lancer après extras.sql et push.sql (relançable). Relancer security.sql ensuite.
--
-- Groupe supprimé par le super admin : tout part (messages, outils rattachés, rappels, clés, photos).
-- Conversation à deux : « Supprimer » la masque pour soi ; quand les deux l'ont supprimée
-- (et rien n'a été écrit depuis), elle est supprimée pour de bon, avec tout ce qui va avec.
-- Les tables liées sont en « on delete cascade » ; les fichiers photo, eux, sont effacés
-- par la fonction push (seule à pouvoir supprimer des fichiers du stockage).

-- Demande à la fonction push d'effacer les photos d'une conversation (dossier media/<conv>/)
create or replace function public.purge_media(conv uuid)
returns void language plpgsql security definer set search_path = public as $$
declare secret text;
begin
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'push_secret';
  if secret is null then return; end if;
  perform net.http_post(
    url := 'https://jsxwhyhriyeizlnmiknf.supabase.co/functions/v1/push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', secret),
    body := jsonb_build_object('event', 'purge', 'conv', conv)
  );
end $$;
revoke all on function public.purge_media(uuid) from public, anon, authenticated;

create or replace function public.delete_group(conv uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from conversations where id = conv and is_group) then raise exception 'Groupe introuvable'; end if;
  if public.my_role(conv) is distinct from 'super_admin' then raise exception 'Réservé au super admin'; end if;
  delete from conversations where id = conv;
  perform purge_media(conv);
end $$;
revoke all on function public.delete_group(uuid) from public, anon;
grant execute on function public.delete_group(uuid) to authenticated;

-- Conversation à deux masquée des deux côtés : suppression définitive
create or replace function public.purge_hidden_dm()
returns trigger language plpgsql security definer set search_path = public as $$
declare c conversations;
begin
  if new.hidden_at is null then return null; end if;
  select * into c from conversations where id = new.conversation_id;
  if c.id is null or c.is_group then return null; end if;
  if exists (select 1 from members m where m.conversation_id = c.id
             and (m.hidden_at is null or m.hidden_at < c.last_message_at)) then
    return null;
  end if;
  delete from conversations where id = c.id;
  perform purge_media(c.id);
  return null;
end $$;
drop trigger if exists on_dm_hidden on public.members;
create trigger on_dm_hidden after update of hidden_at on public.members
  for each row execute function public.purge_hidden_dm();
