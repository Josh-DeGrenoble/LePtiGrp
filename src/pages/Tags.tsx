import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase, errMsg, type Tag } from '../lib/supabase'
import { loadFriends, TAG_COLORS, type FriendWithTags } from '../lib/friends'
import { Screen } from '../components/Layout'
import { Avatar } from '../components/Avatar'
import { TagChip } from '../components/TagChip'
import { IconBack } from '../components/Icons'

export function TagsList() {
  const [tags, setTags] = useState<Tag[]>([])
  const [friends, setFriends] = useState<FriendWithTags[]>([])
  const [name, setName] = useState('')
  const load = useCallback(async () => { const r = await loadFriends(); setTags(r.tags); setFriends(r.friends) }, [])
  useEffect(() => { load() }, [load])

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    const { error } = await supabase.from('tags').insert({ name: name.trim(), color: TAG_COLORS[tags.length % TAG_COLORS.length] })
    if (error) return alert(errMsg(error))
    setName(''); load()
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
        {tags.map((t) => (
          <Link key={t.id} to={`/tags/${t.id}`} className="tag-row">
            <TagChip tag={t} />
            <span className="muted">{friends.filter((f) => f.tags.some((x) => x.id === t.id)).length} ami(s)</span>
          </Link>
        ))}
        {tags.length === 0 && <p className="empty">Crée des tags pour classer tes amis. Ils ne sont visibles que par toi.</p>}
      </div>
    </Screen>
  )
}

export function TagEdit() {
  const { id } = useParams()
  const nav = useNavigate()
  const [tag, setTag] = useState<Tag | null>(null)
  const [friends, setFriends] = useState<FriendWithTags[]>([])

  const load = useCallback(async () => {
    const r = await loadFriends()
    setTag(r.tags.find((t) => t.id === id) ?? null); setFriends(r.friends)
  }, [id])
  useEffect(() => { load() }, [load])

  if (!tag) return null
  const has = (f: FriendWithTags) => f.tags.some((t) => t.id === tag.id)
  const withTag = friends.filter(has)
  const without = friends.filter((f) => !has(f))

  const toggle = async (f: FriendWithTags) => {
    const on = !has(f)
    // mise à jour optimiste
    setFriends((fs) => fs.map((x) => x.id === f.id ? { ...x, tags: on ? [...x.tags, tag] : x.tags.filter((t) => t.id !== tag.id) } : x))
    const { error } = on
      ? await supabase.from('friend_tags').insert({ tag_id: tag.id, friend_id: f.id })
      : await supabase.from('friend_tags').delete().eq('tag_id', tag.id).eq('friend_id', f.id)
    if (error) { alert(errMsg(error)); load() }
  }

  const save = async (patch: Partial<Tag>) => {
    setTag({ ...tag, ...patch })
    const { error } = await supabase.from('tags').update(patch).eq('id', tag.id)
    if (error) { alert(errMsg(error)); load() }
  }

  const del = async () => {
    if (!confirm(`Supprimer le tag « ${tag.name} » ?`)) return
    await supabase.from('tags').delete().eq('id', tag.id)
    nav('/tags')
  }

  const Row = ({ f }: { f: FriendWithTags }) => (
    <label className="check-row friend-check">
      <input type="checkbox" checked={has(f)} onChange={() => toggle(f)} />
      <Avatar name={f.display_name} url={f.avatar_url} size={36} />
      <span>{f.display_name}</span>
    </label>
  )

  return (
    <Screen header={<>
      <Link to="/tags" className="icon-btn" aria-label="Retour"><IconBack /></Link>
      <h1>{tag.name}</h1>
      <button className="link danger" onClick={del}>Suppr.</button>
    </>}>
      <div className="card form">
        <input defaultValue={tag.name} maxLength={30} onBlur={(e) => e.target.value.trim() && e.target.value !== tag.name && save({ name: e.target.value.trim() })} />
        <div className="colors">
          {TAG_COLORS.map((c) => (
            <button key={c} className={`color${c === tag.color ? ' on' : ''}`} style={{ background: c }} onClick={() => save({ color: c })} aria-label={c} />
          ))}
        </div>
      </div>
      <div className="section-title">Avec ce tag ({withTag.length})</div>
      <div className="list">{withTag.map((f) => <Row key={f.id} f={f} />)}</div>
      <div className="section-title">Autres amis</div>
      <div className="list">{without.map((f) => <Row key={f.id} f={f} />)}</div>
    </Screen>
  )
}
