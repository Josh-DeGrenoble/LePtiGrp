-- LePtiGrp - date d'événement d'un groupe (facultative), réglée dans les paramètres du groupe
-- Relançable. Relancer security.sql ensuite.
alter table public.conversations add column if not exists event_date date;

-- Droit "edit_info" (comme le nom et la photo), groupes uniquement
create or replace function public.set_group_event(conv uuid, day date)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.can(conv, 'edit_info') then raise exception 'Tu ne peux pas modifier le groupe'; end if;
  update conversations set event_date = day where id = conv and is_group;
end $$;
revoke all on function public.set_group_event(uuid, date) from public, anon;
grant execute on function public.set_group_event(uuid, date) to authenticated;
