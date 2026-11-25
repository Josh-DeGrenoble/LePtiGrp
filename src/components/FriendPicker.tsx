import { useEffect, useState } from 'react'
import type { Tag } from '../lib/supabase'
import { loadFriends, type FriendWithTags } from '../lib/friends'
import { Avatar } from './Avatar'
import { TagChip } from './TagChip'

/** Sélection d'amis, avec sélection rapide par tag */
export function FriendPicker({ selected, onChange, exclude = [] }: { selected: string[]; onChange: (ids: string[]) => void; exclude?: string[] }) {
  const [friends, setFriends] = useState<FriendWithTags[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  useEffect(() => { loadFriends().then((r) => { setFriends(r.friends.filter((f) => !exclude.includes(f.id))); setTags(r.tags) }) }, [exclude.join()])

  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id])
  const addTag = (t: Tag) => {
    const ids = friends.filter((f) => f.tags.some((x) => x.id === t.id)).map((f) => f.id)
    onChange([...new Set([...selected, ...ids])])
  }

  return (
    <div>
      {tags.length > 0 && <div className="chip-filter"><span className="muted">Ajouter par tag :</span>{tags.map((t) => <TagChip key={t.id} tag={t} onClick={() => addTag(t)} />)}</div>}
      <div className="list">
        {friends.map((f) => (
          <label key={f.id} className="check-row friend-check">
            <input type="checkbox" checked={selected.includes(f.id)} onChange={() => toggle(f.id)} />
            <Avatar name={f.display_name} url={f.avatar_url} size={36} />
            <span>{f.display_name}</span>
          </label>
        ))}
        {friends.length === 0 && <p className="empty">Aucun ami à ajouter.</p>}
      </div>
    </div>
  )
}
