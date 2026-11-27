import { useConvSizes, isCrowd } from '../lib/convSizes'
import { HeaderMenu } from '../components/HeaderMenu'
import { ask, notify } from '../components/Dialog'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase, errMsg, type ConvSummary } from '../lib/supabase'
import { useMe } from '../lib/auth'
import { norm, shortDate } from '../lib/format'
import { Screen } from '../components/Layout'
import { Avatar } from '../components/Avatar'
import { IconGear, IconPlus, IconUser, IconStar, IconSearch, IconChat, IconUserPlus } from '../components/Icons'
import { EmptyState } from '../components/EmptyState'
import { readCache } from '../lib/network'
import { Sheet, SheetButton } from '../components/Sheet'
import { NotifToggles, ActivityToggles } from '../components/NotifToggles'
import { useOnResume } from '../lib/network'
import { cachedConversations, fetchConversations } from '../lib/myConversations'
import { useLongPress } from '../components/useLongPress'
import { useDecrypted, type CipherRow } from '../lib/e2ee'

export default function Conversations() {
  const me = useMe()
  const [convs, setConvs] = useState<ConvSummary[]>(cachedConversations)
  const sizes = useConvSizes()
  const [loaded, setLoaded] = useState(false)
  const [selected, setSelected] = useState<ConvSummary | null>(null)

  const load = useCallback(async () => {
    const data = await fetchConversations()
    if (data) setConvs(data)
    setLoaded(true)
  }, [])

  useOnResume(load)

  useEffect(() => {
    load()
    // une rafale d'événements (plusieurs messages, lecture…) = un seul rechargement
    let t = 0
    const soon = () => { clearTimeout(t); t = window.setTimeout(load, 400) }
    const ch = supabase.channel('convs-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, soon)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'members', filter: `user_id=eq.${me}` }, soon)
      .subscribe()
    return () => { clearTimeout(t); supabase.removeChannel(ch) }
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
    if (c.last_kind === 'activity') return (c.last_content ?? '').split('\n').pop() ?? ''
    const p = plainOf(r)
    return !p ? '🔒' : p.status === 'locked' ? '🔒 Message chiffré' : p.status === 'invalid' ? '⚠️ Message illisible' : (p.text || (p.photo ? '📷 Photo' : ''))
  }
  const [q, setQ] = useState('')
  const shown = convs.filter((c) => !q.trim() || norm(c.name ?? '').includes(norm(q.trim())))
  const favs = shown.filter((c) => c.is_favorite)
  const others = shown.filter((c) => !c.is_favorite)
  const row = (c: ConvSummary) => <ConvRow key={c.id} c={c} last={lastText(c)} me={me} onMenu={() => setSelected(c)} crowd={isCrowd(sizes, c)} />

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
      <h1 className="brand">LePtiGrp</h1>
      <HeaderMenu />
      <Link to="/settings" className="icon-btn" aria-label="Paramètres"><IconGear /></Link>
    </>}>
      {!loaded && convs.length === 0 && <div className="conv-list skeleton-list" aria-label="Chargement…">
        {[0, 1, 2, 3, 4].map((i) => <div key={i} className="sk-conv" style={{ animationDelay: `${i * 90}ms` }}>
          <span className="sk sk-avatar" /><span className="sk-lines"><span className="sk" style={{ width: `${45 + (i * 13) % 30}%` }} /><span className="sk" style={{ width: `${60 + (i * 17) % 30}%` }} /></span>
        </div>)}
      </div>}
      {loaded && convs.length === 0 && <EmptyState icon={<IconChat size={36} />} title="Aucune discussion pour l'instant"
        text="Ajoute des amis puis touche l'un d'eux pour discuter, ou crée un groupe."
        action={<><Link to="/friends" className="btn primary with-icon"><IconUserPlus size={18} /> Ajouter des amis</Link>
          <Link to="/new" className="btn">Créer un groupe</Link></>} />}
      {convs.length > 4 && <label className="conv-search"><IconSearch />
        <input placeholder="Rechercher" value={q} onChange={(e) => setQ(e.target.value)} type="search" /></label>}
      {favs.length > 0 && <section className="conv-section">
        <div className="conv-list">{favs.map(row)}</div>
      </section>}
      {others.length > 0 && <section className="conv-section">
        <div className="conv-list">{others.map(row)}</div>
      </section>}
      {q && shown.length === 0 && <p className="empty">Aucune discussion trouvée.</p>}
      <Link to="/new" className="fab" aria-label="Nouveau groupe"><IconPlus size={32} /></Link>

      <Sheet open={!!selected} onClose={() => setSelected(null)} title={selected?.name ?? ''}>
        {selected && <>
          <button className="toggle-row fav-row" onClick={() => updateMember({ is_favorite: !selected.is_favorite })} aria-pressed={selected.is_favorite}>
            <span>Favori</span>
            <span className="fav-star"><IconStar size={24} filled={selected.is_favorite} /></span>
          </button>
          <div className="sheet-section">Notifications</div>
          <NotifToggles prefs={selected} onChange={updateMember} />
          <div className="sheet-section">Modifs des outils</div>
          <ActivityToggles prefs={selected} onChange={updateMember} />
          <div className="sheet-sep" />
          <SheetButton danger onClick={async () => {
            if (!(await ask(selected.is_group ? 'Supprimer la conversation ? Elle disparaît de ta liste (tu restes dans le groupe) et revient au prochain message, sans l\'historique.'
              : 'Supprimer la conversation ? Elle disparaît de ta liste. Si l\'autre la supprime aussi, elle est effacée pour de bon, photos comprises.'))) return
            await updateMember({ hidden_at: new Date().toISOString() }); setSelected(null)
          }}>
            Supprimer la conversation
          </SheetButton>
          {selected.is_group && <SheetButton danger onClick={leave}>Quitter le groupe</SheetButton>}
        </>}
      </Sheet>
    </Screen>
  )
}

function ConvRow({ c, last, me, onMenu, crowd }: { c: ConvSummary; last: string | null; me: string; onMenu: () => void; crowd: boolean }) {
  const nav = useNavigate()
  const press = useLongPress(onMenu, () => nav(`/c/${c.id}`))
  const name = c.name ?? 'Discussion'
  const unread = c.unread > 0
  // « Toi : » pour mes messages ; le prénom de l'auteur seulement dans les groupes
  const who = c.last_author_id === me ? 'Toi' : c.is_group ? c.last_author?.split(' ')[0] : null
  const draft = readCache<string>(`draft:${c.id}`, '')
  return (
    <div className={`conv-row${unread ? ' unread' : ''}`} {...press} role="button" tabIndex={0}>
      <button className="avatar-btn" aria-label="Paramètres" onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}
        onClick={() => nav(`/c/${c.id}/settings`)}>
        <Avatar name={name} url={c.avatar_url} group={crowd} size={52} />
      </button>
      <div className="conv-main">
        <div className="conv-top">
          <span className="conv-name">{name}</span>
          <span className="conv-date">{shortDate(c.last_message_at)}</span>
        </div>
        <div className="conv-bottom">
          <span className="conv-last">{draft ? <><b className="conv-draft">Brouillon : </b>{draft}</> : last ? <>{who && <b>{who} : </b>}{last}</> : <i>Aucun message</i>}</span>
          {unread && <span className="badge">{c.unread > 99 ? '99+' : c.unread}</span>}
        </div>
      </div>
    </div>
  )
}
