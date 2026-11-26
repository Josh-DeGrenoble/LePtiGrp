import { supabase, type Profile, type Tag } from './supabase'
import { readCache, writeCache } from './network'
import { notify } from '../components/Dialog'

export type FriendWithTags = Profile & { tags: Tag[] }

/** Mes amis + mes tags (privés) posés sur chacun */
export async function loadFriends(): Promise<{ friends: FriendWithTags[]; tags: Tag[] }> {
  const [f, t, ft] = await Promise.all([
    supabase.from('friendships').select('friend:profiles!friendships_friend_id_fkey(*)'),
    supabase.from('tags').select('id,name,color').order('name'),
    supabase.from('friend_tags').select('tag_id,friend_id'),
  ])
  const err = f.error ?? t.error ?? ft.error
  if (err) throw err
  const tags = (t.data ?? []) as Tag[]
  const byId = new Map(tags.map((x) => [x.id, x]))
  const links = (ft.data ?? []) as { tag_id: string; friend_id: string }[]
  const friends = ((f.data ?? []) as unknown as { friend: Profile }[])
    .map(({ friend }) => ({
      ...friend,
      tags: links.filter((l) => l.friend_id === friend.id).map((l) => byId.get(l.tag_id)!).filter(Boolean),
    }))
    .sort((a, b) => a.display_name.localeCompare(b.display_name, 'fr'))
  writeCache('friends', { friends, tags })
  return { friends, tags }
}

/** Dernière liste connue (affichage instantané avant le rechargement) */
export const cachedFriends = () => readCache<{ friends: FriendWithTags[]; tags: Tag[] }>('friends', { friends: [], tags: [] })

export const TAG_COLORS = ['#2563eb', '#f59e0b', '#10b981', '#ec4899', '#ef4444', '#14b8a6', '#8b5cf6', '#64748b']

export function friendLink(code: string) {
  return `${window.location.origin}/add/${code}`
}

/** Lien d'ami ouvert avant d'avoir un compte : le code est gardé jusqu'à la première connexion */
const PENDING = 'pending-friend'
export function rememberFriendCode(code: string) {
  try { localStorage.setItem(PENDING, code) } catch { /* stockage indisponible */ }
}
export async function addPendingFriend() {
  let code: string | null = null
  try { code = localStorage.getItem(PENDING) } catch { return }
  if (!code) return
  const { data, error } = await supabase.rpc('add_friend_by_code', { code })
  try { localStorage.removeItem(PENDING) } catch { /* rien */ }
  if (!error) notify(`${(data as { display_name: string }).display_name} est maintenant ton ami(e) !`)
}
