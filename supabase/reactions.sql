-- Réactions aux messages (un smiley par personne et par message, comme WhatsApp)
-- En clair : seul l'emoji est stocké, pas le contenu du message.
create table if not exists public.message_reactions (
  message_id bigint not null references public.messages(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 16),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
create index if not exists message_reactions_msg on public.message_reactions(message_id);

alter table public.message_reactions enable row level security;

drop policy if exists "reactions_select" on public.message_reactions;
create policy "reactions_select" on public.message_reactions for select to authenticated
  using (exists (select 1 from public.messages m where m.id = message_id and public.is_member(m.conversation_id)));

drop policy if exists "reactions_write" on public.message_reactions;
create policy "reactions_write" on public.message_reactions for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and exists (select 1 from public.messages m where m.id = message_id and public.is_member(m.conversation_id)));

revoke all on public.message_reactions from anon;
grant select, insert, update, delete on public.message_reactions to authenticated;
grant all on public.message_reactions to service_role;

do $$ begin
  begin alter publication supabase_realtime add table public.message_reactions; exception when others then null; end;
end $$;
