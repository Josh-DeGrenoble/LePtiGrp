import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, errMsg, type Tag } from '../lib/supabase'
import { loadFriends, TAG_COLORS, type FriendWithTags } from '../lib/friends'
import { Screen } from '../components/Layout'
import { Avatar } from '../components/Avatar'
import { IconBack, IconPencil, IconPlus } from '../components/Icons'
import { ask, notify } from '../components/Dialog'

const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

/**
 * Page Tags : barre de tags en haut (un tag sélectionné), puis réglages du tag
 * (nom, couleur) et la liste de mes amis avec recherche. Toucher un ami ajoute/retire le tag.
 */
export default function Tags() {
  const [tags, setTags] = useState<Tag[]>([])
  const [friends, setFriends] = useState<FriendWithTags[]>([])
  const [selId, setSelId] = useState<string | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    try {
      const r = await loadFriends()
      setTags(r.tags); setFriends(r.friends)
      setSelId((id) => id ?? r.tags[0]?.id ?? null)
    } catch (e) { notify(errMsg(e)) }
  }, [])
  useEffect(() => { load() }, [load])

  const tag = tags.find((t) => t.id === selId) ?? null

  const run = async (q: PromiseLike<{ error: unknown }>) => {
    const { error } = await q
    if (error) { notify(errMsg(error)); load() }
  }

  const create = async () => {
    const base = 'Nouveau tag'
    let name = base, i = 2
    while (tags.some((t) => t.name === name)) name = `${base} ${i++}`
    const { data, error } = await supabase.from('tags')
      .insert({ name, color: TAG_COLORS[tags.length % TAG_COLORS.length] }).select('id,name,color').single()
    if (error) return notify(errMsg(error))
    setTags([...tags, data as Tag]); setSelId(data.id); setRenaming(true)
  }

  const update = (patch: Partial<Tag>) => {
    if (!tag) return
    setTags((ts) => ts.map((t) => (t.id === tag.id ? { ...t, ...patch } : t)))
    run(supabase.from('tags').update(patch).eq('id', tag.id))
  }

  const remove = async () => {
    if (!tag || !(await ask(`Supprimer le tag « ${tag.name} » ?`))) return
    const rest = tags.filter((t) => t.id !== tag.id)
    setTags(rest); setSelId(rest[0]?.id ?? null)
    run(supabase.from('tags').delete().eq('id', tag.id))
  }

  const toggle = (f: FriendWithTags) => {
    if (!tag) return
    const on = !f.tags.some((t) => t.id === tag.id)
    setFriends((fs) => fs.map((x) => x.id !== f.id ? x : { ...x, tags: on ? [...x.tags, tag] : x.tags.filter((t) => t.id !== tag.id) }))
    run(on
      ? supabase.from('friend_tags').insert({ tag_id: tag.id, friend_id: f.id })
      : supabase.from('friend_tags').delete().eq('tag_id', tag.id).eq('friend_id', f.id))
  }

  const has = (f: FriendWithTags) => !!tag && f.tags.some((t) => t.id === tag.id)
  const shown = friends.filter((f) => norm(f.display_name).includes(norm(search.trim())))
  const withTag = shown.filter(has)
  const others = shown.filter((f) => !has(f))

  const row = (f: FriendWithTags) => {
    const on = has(f)
    return (
      <button key={f.id} className={`tag-friend${on ? ' on' : ''}`} onClick={() => toggle(f)} aria-pressed={on}
        style={on ? { background: tag!.color + '22' } : undefined}>
        <Avatar name={f.display_name} url={f.avatar_url} size={36} />
        <span>{f.display_name}</span>
        <span className="tag-dot" style={on ? { background: tag!.color, borderColor: tag!.color } : undefined} />
      </button>
    )
  }

  return (
    <Screen header={<>
      <Link to="/friends" className="icon-btn" aria-label="Retour"><IconBack /></Link>
      <h1>Tags</h1><span className="icon-btn" />
    </>}>
      <div className="tag-bar">
        {tags.map((t) => (
          <button key={t.id} className={`tag-tab${t.id === selId ? ' on' : ''}`} onClick={() => { setSelId(t.id); setRenaming(false) }}
            style={t.id === selId ? { background: t.color, borderColor: t.color } : { color: t.color, borderColor: t.color }}>
            {t.name} <small>{friends.filter((f) => f.tags.some((x) => x.id === t.id)).length}</small>
          </button>
        ))}
        <button className="tag-tab new" onClick={create} aria-label="Nouveau tag"><IconPlus size={18} /></button>
      </div>

      {!tag ? <p className="empty">Crée ton premier tag avec le bouton +. Les tags ne sont visibles que par toi.</p> : <>
        <div className="tag-settings">
          {renaming ? (
            <input className="title-input" defaultValue={tag.name} maxLength={30} autoFocus onFocus={(e) => e.target.select()}
              onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') setRenaming(false) }}
              onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== tag.name) update({ name: v }); setRenaming(false) }} />
          ) : (
            <button className="title-edit" onClick={() => setRenaming(true)} style={{ color: tag.color }}>
              <span>{tag.name}</span><IconPencil />
            </button>
          )}
          <div className="colors small-colors">
            {TAG_COLORS.map((c) => (
              <button key={c} className={`color${c === tag.color ? ' on' : ''}`} style={{ background: c }} onClick={() => update({ color: c })} aria-label={c} />
            ))}
          </div>
          <button className="link danger small" onClick={remove}>Supprimer</button>
        </div>

        <input className="search" type="search" placeholder="Rechercher un ami…" value={search} onChange={(e) => setSearch(e.target.value)} />

        {withTag.length > 0 && <div className="section-title">Ont le tag ({withTag.length})</div>}
        <div className="list">{withTag.map(row)}</div>
        {others.length > 0 && <div className="section-title">Autres amis</div>}
        <div className="list">{others.map(row)}</div>
        {shown.length === 0 && <p className="empty">Aucun ami trouvé.</p>}
      </>}
    </Screen>
  )
}
