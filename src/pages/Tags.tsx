import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, errMsg, type Tag } from '../lib/supabase'
import { loadFriends, TAG_COLORS, type FriendWithTags } from '../lib/friends'
import { Screen } from '../components/Layout'
import { Avatar } from '../components/Avatar'
import { TagChip } from '../components/TagChip'
import { IconBack } from '../components/Icons'
import { ask, notify } from '../components/Dialog'

/** Page Tags : un clic sur un tag le déplie sur place (nom, couleur, amis) ; un 2e clic le replie. */
export default function Tags() {
  const [tags, setTags] = useState<Tag[]>([])
  const [friends, setFriends] = useState<FriendWithTags[]>([])
  const [name, setName] = useState('')
  const [open, setOpen] = useState<string | null>(null)

  const load = useCallback(async () => {
    try { const r = await loadFriends(); setTags(r.tags); setFriends(r.friends) } catch (e) { notify(errMsg(e)) }
  }, [])
  useEffect(() => { load() }, [load])

  const run = async (q: PromiseLike<{ error: unknown }>) => {
    const { error } = await q
    if (error) { notify(errMsg(error)); load() }
  }

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    const { data, error } = await supabase.from('tags')
      .insert({ name: name.trim(), color: TAG_COLORS[tags.length % TAG_COLORS.length] }).select('id,name,color').single()
    if (error) return notify(errMsg(error))
    setName(''); setTags([...tags, data as Tag]); setOpen(data.id)
  }

  const update = (tag: Tag, patch: Partial<Tag>) => {
    setTags((ts) => ts.map((t) => (t.id === tag.id ? { ...t, ...patch } : t)))
    run(supabase.from('tags').update(patch).eq('id', tag.id))
  }

  const remove = async (tag: Tag) => {
    if (!(await ask(`Supprimer le tag « ${tag.name} » ?`))) return
    setTags((ts) => ts.filter((t) => t.id !== tag.id)); setOpen(null)
    run(supabase.from('tags').delete().eq('id', tag.id))
  }

  const toggleFriend = (tag: Tag, f: FriendWithTags) => {
    const on = !f.tags.some((t) => t.id === tag.id)
    setFriends((fs) => fs.map((x) => x.id !== f.id ? x : { ...x, tags: on ? [...x.tags, tag] : x.tags.filter((t) => t.id !== tag.id) }))
    run(on
      ? supabase.from('friend_tags').insert({ tag_id: tag.id, friend_id: f.id })
      : supabase.from('friend_tags').delete().eq('tag_id', tag.id).eq('friend_id', f.id))
  }

  return (
    <Screen header={<>
      <Link to="/friends" className="icon-btn" aria-label="Retour"><IconBack /></Link>
      <h1>Tags</h1><span className="icon-btn" />
    </>}>
      <form className="add-friend" onSubmit={create}>
        <input placeholder="Nouveau tag (ex : Famille)" value={name} maxLength={30} onChange={(e) => setName(e.target.value)} />
        <button className="btn primary" disabled={!name.trim()}>Créer</button>
      </form>
      <div className="list">
        {tags.map((t) => {
          const count = friends.filter((f) => f.tags.some((x) => x.id === t.id)).length
          if (open !== t.id) return (
            <button key={t.id} className="tag-row" onClick={() => setOpen(t.id)}>
              <TagChip tag={t} /><span className="muted">{count} ami(s)</span>
            </button>
          )
          return (
            <div key={t.id} className="tag-panel" style={{ borderColor: t.color }}>
              <div className="tag-panel-head">
                <input className="tag-name" defaultValue={t.name} maxLength={30} autoFocus style={{ color: t.color }}
                  onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== t.name) update(t, { name: v }) }}
                  onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
                <button className="link" onClick={() => setOpen(null)}>OK</button>
              </div>
              <div className="colors">
                {TAG_COLORS.map((c) => (
                  <button key={c} className={`color${c === t.color ? ' on' : ''}`} style={{ background: c }} onClick={() => update(t, { color: c })} aria-label={c} />
                ))}
              </div>
              <div className="friend-pills">
                {friends.map((f) => {
                  const on = f.tags.some((x) => x.id === t.id)
                  return (
                    <button key={f.id} className={`friend-pill${on ? ' on' : ''}`} style={on ? { background: t.color + '26', borderColor: t.color } : undefined}
                      onClick={() => toggleFriend(t, f)} aria-pressed={on}>
                      <Avatar name={f.display_name} url={f.avatar_url} size={28} />{f.display_name}
                    </button>
                  )
                })}
              </div>
              <button className="link danger" onClick={() => remove(t)}>Supprimer le tag</button>
            </div>
          )
        })}
        {tags.length === 0 && <p className="empty">Crée des tags pour classer tes amis. Ils ne sont visibles que par toi.</p>}
      </div>
    </Screen>
  )
}
