import { useEffect, useState } from 'react'
import { supabase, type Tag } from '../lib/supabase'
import { loadFriends, type FriendWithTags } from '../lib/friends'
import { norm } from '../lib/format'
import { Avatar } from './Avatar'
import { TagChip } from './TagChip'

type Group = { id: string; name: string; memberIds: string[] }
const GROUP_COLOR = '#64748b'

/** Membres des groupes dont je fais partie */
async function loadGroups(): Promise<Group[]> {
  const { data } = await supabase.from('members')
    .select('conversation_id, user_id, conversations!inner(name, is_group)').eq('conversations.is_group', true)
  const map = new Map<string, Group>()
  for (const r of (data ?? []) as unknown as { conversation_id: string; user_id: string; conversations: { name: string } }[]) {
    const g = map.get(r.conversation_id) ?? { id: r.conversation_id, name: r.conversations.name, memberIds: [] }
    g.memberIds.push(r.user_id)
    map.set(r.conversation_id, g)
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'fr'))
}

/** Sélection d'amis : recherche, sélection rapide par tag ou par groupe existant, tags visibles sur chaque ami */
export function FriendPicker({ selected, onChange, exclude = [] }: { selected: string[]; onChange: (ids: string[]) => void; exclude?: string[] }) {
  const [friends, setFriends] = useState<FriendWithTags[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [search, setSearch] = useState('')
  const excludeKey = exclude.join()

  useEffect(() => {
    loadFriends().then((r) => { setFriends(r.friends.filter((f) => !exclude.includes(f.id))); setTags(r.tags) })
    loadGroups().then(setGroups)
  }, [excludeKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const friendIds = new Set(friends.map((f) => f.id))
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])
  /** Ajoute tout le lot ; s'il est déjà entièrement sélectionné, le retire */
  const toggleSet = (ids: string[]) => {
    const all = ids.length > 0 && ids.every((id) => selected.includes(id))
    onChange(all ? selected.filter((id) => !ids.includes(id)) : [...new Set([...selected, ...ids])])
  }
  const tagIds = (t: Tag) => friends.filter((f) => f.tags.some((x) => x.id === t.id)).map((f) => f.id)
  const groupIds = (g: Group) => g.memberIds.filter((id) => friendIds.has(id))
  const isFull = (ids: string[]) => ids.length > 0 && ids.every((id) => selected.includes(id))

  const shownGroups = groups.filter((g) => groupIds(g).length > 0)
  const shown = friends.filter((f) => norm(f.display_name).includes(norm(search.trim())))

  return (
    <div>
      {(tags.length > 0 || shownGroups.length > 0) && (
        <div className="chip-filter">
          {tags.map((t) => (
            <TagChip key={t.id} tag={t} filled={isFull(tagIds(t))} onClick={() => toggleSet(tagIds(t))} />
          ))}
          {shownGroups.map((g) => (
            <TagChip key={g.id} tag={{ id: g.id, name: g.name, color: GROUP_COLOR }} filled={isFull(groupIds(g))} onClick={() => toggleSet(groupIds(g))} />
          ))}
        </div>
      )}
      <input className="search" type="search" placeholder="Rechercher un ami…" value={search} onChange={(e) => setSearch(e.target.value)} />
      <div className="list">
        {shown.map((f) => {
          const on = selected.includes(f.id)
          return (
            <button key={f.id} className={`tag-friend picker-friend${on ? ' on' : ''}`} onClick={() => toggle(f.id)} aria-pressed={on}>
              <Avatar name={f.display_name} url={f.avatar_url} size={36} />
              <span>
                {f.display_name}
                {f.tags.length > 0 && <span className="chips">{f.tags.map((t) => <TagChip key={t.id} tag={t} />)}</span>}
              </span>
              <span className="tag-dot" />
            </button>
          )
        })}
        {friends.length === 0 && <p className="empty">Aucun ami à ajouter.</p>}
      </div>
    </div>
  )
}
