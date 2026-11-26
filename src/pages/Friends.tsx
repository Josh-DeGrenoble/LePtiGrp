import { BackButton } from '../components/BackButton'
import { LimitedInput } from '../components/LimitedInput'
import { ask, notify } from '../components/Dialog'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase, errMsg, type Tag } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { norm } from '../lib/format'
import { loadFriends, cachedFriends, friendLink, TAG_COLORS, type FriendWithTags } from '../lib/friends'
import { Screen } from '../components/Layout'
import { Avatar } from '../components/Avatar'
import { TagChip } from '../components/TagChip'
import { IconShare, IconTag, IconDown, IconSearch, IconUserPlus, IconClose } from '../components/Icons'
import { Sheet, SheetButton } from '../components/Sheet'
import { ProfileEditor } from '../components/ProfileEditor'

export default function Friends() {
  const { profile } = useAuth()
  const nav = useNavigate()
  const [friends, setFriends] = useState<FriendWithTags[]>(() => cachedFriends().friends)
  const [tags, setTags] = useState<Tag[]>(() => cachedFriends().tags)
  const [code, setCode] = useState('')
  const [adding, setAdding] = useState(false)
  const [search, setSearch] = useState('')
  const [msg, setMsg] = useState('')
  const [editing, setEditing] = useState<FriendWithTags | null>(null)
  const [newTag, setNewTag] = useState('')
  const [filter, setFilter] = useState<string | null>(null)
  const [editProfile, setEditProfile] = useState(false)

  const load = useCallback(async () => {
    let r
    try { r = await loadFriends() } catch (e) { setMsg(`Erreur : ${errMsg(e)}`); return }
    setFriends(r.friends); setTags(r.tags)
    setEditing((e) => (e ? r.friends.find((f) => f.id === e.id) ?? null : null))
  }, [])
  useEffect(() => { load() }, [load])

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    setMsg('')
    const { data, error } = await supabase.rpc('add_friend_by_code', { code })
    if (error) return setMsg(errMsg(error))
    setMsg(`${(data as { display_name: string }).display_name} ajouté(e) !`)
    setCode(''); setAdding(false); load()
  }

  const share = async () => {
    if (!profile) return
    const url = friendLink(profile.friend_code)
    const text = `Ajoute-moi sur LePtiGrp ! Code : ${profile.friend_code}`
    if (navigator.share) { try { await navigator.share({ title: 'LePtiGrp', text, url }) } catch { /* annulé */ } }
    else { await navigator.clipboard.writeText(url); setMsg('Lien copié !') }
  }

  const openDm = async (friendId: string) => {
    const { data, error } = await supabase.rpc('get_or_create_dm', { friend: friendId })
    if (error) return notify(errMsg(error))
    nav(`/c/${data}`)
  }

  const toggleTag = async (tag: Tag, on: boolean) => {
    if (!editing) return
    const q = on
      ? supabase.from('friend_tags').insert({ tag_id: tag.id, friend_id: editing.id })
      : supabase.from('friend_tags').delete().eq('tag_id', tag.id).eq('friend_id', editing.id)
    const { error } = await q
    if (error) notify(errMsg(error))
    load()
  }

  const createTagFor = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editing || !newTag.trim()) return
    const { data, error } = await supabase.from('tags')
      .insert({ name: newTag.trim(), color: TAG_COLORS[tags.length % TAG_COLORS.length] }).select().single()
    if (error) return notify(errMsg(error))
    await supabase.from('friend_tags').insert({ tag_id: data.id, friend_id: editing.id })
    setNewTag(''); load()
  }

  const remove = async () => {
    if (!editing || !(await ask(`Retirer ${editing.display_name} de tes amis ?`))) return
    const { error } = await supabase.rpc('remove_friend', { friend: editing.id })
    if (error) return notify(errMsg(error))
    setEditing(null); load()
  }

  const shown = friends
    .filter((f) => !filter || f.tags.some((t) => t.id === filter))
    .filter((f) => norm(f.display_name).includes(norm(search.trim())))

  return (
    <Screen header={<>
      <BackButton to="/" />
      <h1>Amis</h1>
      <button className="icon-btn" disabled aria-label="Bientôt"><IconDown /></button>
      <Link to="/tags" className="icon-btn" aria-label="Gérer les tags"><IconTag /></Link>
    </>}>
      {profile && (
        <div className="card me-card">
          <button className="me-avatar" onClick={() => setEditProfile(true)} aria-label="Modifier mon profil">
            <Avatar name={profile.display_name} url={profile.avatar_url} size={52} />
          </button>
          <div className="me-info" onClick={() => setEditProfile(true)}>
            <div className="me-name">{profile.display_name}</div>
            <div className="me-code">Mon code : <b>{profile.friend_code}</b></div>
          </div>
          <button className="icon-btn" onClick={share} aria-label="Partager mon lien"><IconShare /></button>
        </div>
      )}

      {/* Une seule barre : recherche d'amis, ou saisie du code quand on ajoute un ami */}
      <form className={`search-bar${adding ? ' adding' : ''}`} onSubmit={add}>
        <div className="search-field">
          {adding ? <IconUserPlus /> : <IconSearch />}
          {adding
            ? <input key="code" inputMode="numeric" pattern="[0-9]{5}" maxLength={5} placeholder="Code ami (5 chiffres)" autoFocus
                value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
            : <input key="search" type="search" placeholder="Rechercher un ami…" value={search} onChange={(e) => setSearch(e.target.value)} />}
          {adding && <button type="button" className="icon-btn small-btn" onClick={() => { setAdding(false); setCode(''); setMsg('') }} aria-label="Annuler"><IconClose /></button>}
        </div>
        {adding
          ? <button className="btn primary" disabled={code.length !== 5}>Ajouter</button>
          : <button type="button" className="btn" onClick={() => { setAdding(true); setMsg('') }}>Nouvel ami</button>}
      </form>
      {msg && <p className="info center">{msg}</p>}

      {tags.length > 0 && (
        <div className="chip-filter truncate">
          {tags.map((t) => (
            <span key={t.id} className={filter && filter !== t.id ? 'dim' : ''}>
              <TagChip tag={t} onClick={() => setFilter(filter === t.id ? null : t.id)} />
            </span>
          ))}
        </div>
      )}

      <div className="list">
        {shown.map((f) => (
          <div key={f.id} className="friend-row">
            <button className="friend-main" onClick={() => openDm(f.id)}>
              <Avatar name={f.display_name} url={f.avatar_url} />
              <div>
                <div className="friend-name">{f.display_name}</div>
                <div className="chips">{f.tags.map((t) => <TagChip key={t.id} tag={t} />)}</div>
              </div>
            </button>
            <button className="icon-btn" onClick={() => setEditing(f)} aria-label="Modifier"><IconTag size={20} /></button>
          </div>
        ))}
        {friends.length > 0 && shown.length === 0 && <p className="empty">Aucun ami trouvé.</p>}
        {friends.length === 0 && <p className="empty">Partage ton code ou ton lien pour ajouter tes premiers amis.</p>}
      </div>

      <ProfileEditor open={editProfile} onClose={() => setEditProfile(false)} />

      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing ? `Tags de ${editing.display_name}` : ''}>
        {editing && <>
          <div className="tag-checks">
            {tags.map((t) => {
              const on = editing.tags.some((x) => x.id === t.id)
              return (
                <label key={t.id} className="check-row">
                  <input type="checkbox" checked={on} onChange={(e) => toggleTag(t, e.target.checked)} />
                  <TagChip tag={t} />
                </label>
              )
            })}
          </div>
          <form className="inline-form" onSubmit={createTagFor}>
            <LimitedInput placeholder="Nouveau tag" value={newTag} max={30} onChange={(e) => setNewTag(e.target.value)} />
            <button className="btn" disabled={!newTag.trim()}>Créer</button>
          </form>
          <div className="sheet-sep" />
          <SheetButton danger onClick={remove}>Retirer des amis</SheetButton>
        </>}
      </Sheet>
    </Screen>
  )
}
