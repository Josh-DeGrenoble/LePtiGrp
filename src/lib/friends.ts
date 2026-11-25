import { supabase, type Profile, type Tag } from './supabase'

export type FriendWithTags = Profile & { tags: Tag[] }

/** Mes amis + mes tags (privés) posés sur chacun */
export async function loadFriends(): Promise<{ friends: FriendWithTags[]; tags: Tag[] }> {
  const [f, t, ft] = await Promise.all([
    supabase.from('friendships').select('friend:profiles!friendships_friend_id_fkey(*)'),
    supabase.from('tags').select('id,name,color').order('name'),
    supabase.from('friend_tags').select('tag_id,friend_id'),
  ])
  const tags = (t.data ?? []) as Tag[]
  const byId = new Map(tags.map((x) => [x.id, x]))
  const links = (ft.data ?? []) as { tag_id: string; friend_id: string }[]
  const friends = ((f.data ?? []) as unknown as { friend: Profile }[])
    .map(({ friend }) => ({
      ...friend,
      tags: links.filter((l) => l.friend_id === friend.id).map((l) => byId.get(l.tag_id)!).filter(Boolean),
    }))
    .sort((a, b) => a.display_name.localeCompare(b.display_name, 'fr'))
  return { friends, tags }
}

export const TAG_COLORS = ['#7c8cf8', '#f59e0b', '#10b981', '#ec4899', '#ef4444', '#14b8a6', '#8b5cf6', '#64748b']

export function friendLink(code: string) {
  return `${window.location.origin}/add/${code}`
}
