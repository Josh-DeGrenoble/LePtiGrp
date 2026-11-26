import { useConvSizes, isCrowd } from '../lib/convSizes'
import { HeaderMenu } from '../components/HeaderMenu'
import { ask, notify } from '../components/Dialog'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase, errMsg, type ConvSummary } from '../lib/supabase'
import { useMe } from '../lib/auth'
import { shortDate } from '../lib/format'
import { Screen } from '../components/Layout'
import { Avatar } from '../components/Avatar'
import { IconGear, IconPlus, IconUser, IconStar } from '../components/Icons'
import { Sheet, SheetButton } from '../components/Sheet'
import { NotifToggles } from '../components/NotifToggles'
import { readCache, writeCache, useOnResume } from '../lib/network'
import { useLongPress } from '../components/useLongPress'
import { useDecrypted, type CipherRow } from '../lib/e2ee'

export default function Conversations() {
  const me = useMe()
  const [convs, setConvs] = useState<ConvSummary[]>(() => readCache<ConvSummary[]>('convs', []))
  const sizes = useConvSizes()
  const [loaded, setLoaded] = useState(false)
  const [selected, setSelected] = useState<ConvSummary | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('my_conversations')
    if (!error) { setConvs(data as ConvSummary[]); writeCache('convs', data) }
    setLoaded(true)
  }, [])

  useOnResume(load)

  useEffect(() => {
    load()
    const ch = supabase.channel('convs-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'members', filter: `user_id=eq.${me}` }, load)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load, me])

  // Dernier message : renvoyé chiffré par le serveur, déchiffré ici
  const lastRows = useMemo(() => new Map<string, CipherRow>(convs.map((c) => [c.id, {
    conversation_id: c.id, author_id: c.last_author_id ?? null, content: c.last_content,
    ciphertext: c.last_ciphertext, epoch: c.last_epoch, client_id: c.last_client_id,
  }])), [convs])
  const rowList = useMemo(() => [...lastRows.values()], [lastRows])
  const plainOf = useDecrypted(rowList)
  const lastText = (c: ConvSummary) => {
    const r = lastRows.get(c.id)
    if (!r || (!r.content && !r.ciphertext)) return null
    const p = plainOf(r)
    return !p ? '🔒' : p.status === 'locked' ? '🔒 Message chiffré' : p.status === 'invalid' ? '⚠️ Message illisible' : p.text
  }
  const favs = convs.filter((c) => c.is_favorite)
  const others = convs.filter((c) => !c.is_favorite)

  const updateMember = async (patch: Partial<ConvSummary> & { hidden_at?: string }) => {
    if (!selected) return
    const { error } = await supabase.from('members').update(patch).eq('conversation_id', selected.id).eq('user_id', me)
    if (error) return notify(errMsg(error))
    setSelected({ ...selected, ...patch })
    load()
  }

  const leave = async () => {
    if (!selected || !(await ask(`Quitter « ${selected.name} » ?`))) return
    const { error } = await supabase.rpc('leave_conversation', { conv: selected.id })
    if (error) return notify(errMsg(error))
    setSelected(null); load()
  }

  return (
    <Screen header={<>
      <Link to="/friends" className="icon-btn" aria-label="Amis"><IconUser /></Link>
      <h1>Chat</h1>
      <HeaderMenu />
      <Link to="/settings" className="icon-btn" aria-label="Paramètres"><IconGear /></Link>
    </>}>
      {loaded && convs.length === 0 && (
        <div className="empty">
          <p>Aucune discussion pour l'instant.</p>
          <p><Link to="/friends">Ajoute des amis</Link> puis touche l'un d'eux pour discuter, ou crée un groupe avec le bouton +.</p>
        </div>
      )}
      <div className="conv-list">
        {favs.map((c) => <ConvRow key={c.id} c={c} last={lastText(c)} onMenu={() => setSelected(c)} crowd={isCrowd(sizes, c)} />)}
        {favs.length > 0 && others.length > 0 && <div className="conv-gap" />}
        {others.map((c) => <ConvRow key={c.id} c={c} last={lastText(c)} onMenu={() => setSelected(c)} crowd={isCrowd(sizes, c)} />)}
      </div>
      <Link to="/new" className="fab" aria-label="Nouveau groupe"><IconPlus size={32} /></Link>

      <Sheet open={!!selected} onClose={() => setSelected(null)} title={selected?.name ?? ''}>
        {selected && <>
          <button className="toggle-row fav-row" onClick={() => updateMember({ is_favorite: !selected.is_favorite })} aria-pressed={selected.is_favorite}>
            <span>Favori</span>
            <span className="fav-star"><IconStar size={24} filled={selected.is_favorite} /></span>
          </button>
          <div className="sheet-section">Notifications</div>
          <NotifToggles prefs={selected} onChange={updateMember} />
          <div className="sheet-sep" />
          <SheetButton danger onClick={async () => { await updateMember({ hidden_at: new Date().toISOString() }); setSelected(null) }}>
            Supprimer la conversation
          </SheetButton>
          {selected.is_group && <SheetButton danger onClick={leave}>Quitter le groupe</SheetButton>}
        </>}
      </Sheet>
    </Screen>
  )
}

function ConvRow({ c, last, onMenu, crowd }: { c: ConvSummary; last: string | null; onMenu: () => void; crowd: boolean }) {
  const nav = useNavigate()
  const press = useLongPress(onMenu, () => nav(`/c/${c.id}`))
  const name = c.name ?? 'Discussion'
  return (
    <div className="conv-row" {...press} role="button" tabIndex={0}>
      <button className="avatar-btn" aria-label="Paramètres" onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}
        onClick={() => nav(`/c/${c.id}/settings`)}>
        <Avatar name={name} url={c.avatar_url} group={crowd} />
      </button>
      <div className="conv-main">
        <div className="conv-name">{name}</div>
        <div className="conv-last">{last ? `${c.last_author ?? '?'} : ${last}` : <i>Aucun message</i>}</div>
      </div>
      <div className="conv-meta">
        <span className="conv-date">{shortDate(c.last_message_at)}</span>
        {c.unread > 0 && <span className="badge">{c.unread}</span>}
      </div>
    </div>
  )
}
