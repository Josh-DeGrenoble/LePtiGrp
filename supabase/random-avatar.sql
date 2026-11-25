-- Avatar aléatoire (parmi les avatars originaux de l'appli) à la création du compte.
-- Liste identique à PRESET_AVATARS dans src/lib/avatars.ts
create or replace function public.random_avatar()
returns text language sql volatile as $$
  select (array['emoji:🦊:#fde68a','emoji:🐼:#bbf7d0','emoji:🐸:#bfdbfe','emoji:🦁:#fbcfe8','emoji:🐙:#ddd6fe','emoji:🦄:#fed7aa','emoji:🐧:#a5f3fc','emoji:🐨:#fecaca','emoji:🦉:#fde68a','emoji:🐢:#bbf7d0','emoji:🐝:#bfdbfe','emoji:🦖:#fbcfe8','emoji:👾:#ddd6fe','emoji:🤖:#fed7aa','emoji:👻:#a5f3fc','emoji:🌵:#fecaca','emoji:🍕:#fde68a','emoji:🎸:#bbf7d0','emoji:🚀:#bfdbfe','emoji:⚡:#fbcfe8'])[1 + floor(random() * 20)::int];
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare code text;
begin
  loop
    code := lpad((floor(random() * 100000))::int::text, 5, '0');
    exit when not exists (select 1 from profiles where friend_code = code);
  end loop;
  insert into profiles (id, display_name, friend_code, avatar_url)
  values (new.id,
          coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), split_part(new.email, '@', 1)),
          code, public.random_avatar());
  return new;
end $$;

-- Donne aussi un avatar aux comptes existants qui n'en ont pas
update public.profiles set avatar_url = public.random_avatar() where avatar_url is null;
