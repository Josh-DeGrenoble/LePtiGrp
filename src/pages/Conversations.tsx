import { ask, notify } from '../components/Dialog'
import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase, errMsg, type ConvSummary } from '../lib/supabase'
import { useMe } from '../lib/auth'
import { shortDate } from '../lib/format'
import { Screen } from '../components/Layout'
import { Avatar } from '../components/Avatar'
import { IconGear, IconPlus, IconUser, IconDown } from '../components/Icons'
import { Sheet, SheetButton, Toggle } from '../components/Sheet'
import { useLongPress } from '../components/useLongPress'

export default function Conversations() {
  const me = useMe()
  const [convs, setConvs] = useState<ConvSummary[]>([])
  const [loaded, setLoaded] = useState(false)
  const [selected, setSelected] = useState<ConvSummary | null>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('my_conversations')
    if (!error) setConvs(data as ConvSummary[])
    setLoaded(true)
  }, [])

  useEffect(() => {
    load()
    const ch = supabase.channel('convs-list')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'members', filter: `user_id=eq.${me}` }, load)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [load, me])

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
      <button className="icon-btn" disabled aria-label="Bientôt"><IconDown /></button>
      <Link to="/settings" className="icon-btn" aria-label="Paramètres"><IconGear /></Link>
    </>}>
      {loaded && convs.length === 0 && (
        <div className="empty">
          <p>Aucune discussion pour l'instant.</p>
          <p><Link to="/friends">Ajoute des amis</Link> puis touche l'un d'eux pour discuter, ou crée un groupe avec le bouton +.</p>
        </div>
      )}
      <div className="conv-list">
        {favs.map((c) => <ConvRow key={c.id} c={c} onMenu={() => setSelected(c)} />)}
        {favs.length > 0 && others.length > 0 && <div className="conv-gap" />}
        {others.map((c) => <ConvRow key={c.id} c={c} onMenu={() => setSelected(c)} />)}
      </div>
      <Link to="/new" className="fab" aria-label="Nouveau groupe"><IconPlus size={32} /></Link>

      <Sheet open={!!selected} onClose={() => setSelected(null)} title={selected?.name ?? ''}>
        {selected && <>
          <SheetButton onClick={() => updateMember({ is_favorite: !selected.is_favorite })}>
            {selected.is_favorite ? '☆ Retirer des favoris' : '★ Ajouter aux favoris'}
          </SheetButton>
          <div className="sheet-section">Notifications</div>
          <Toggle label="Recevoir les notifications" checked={selected.notify_all} onChange={(v) => updateMember({ notify_all: v })} />
          <Toggle label="Quand on me mentionne" checked={selected.notify_mentions} onChange={(v) => updateMember({ notify_mentions: v })} />
          <Toggle label="Quand un message est épinglé" checked={selected.notify_pins} onChange={(v) => updateMember({ notify_pins: v })} />
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

function ConvRow({ c, onMenu }: { c: ConvSummary; onMenu: () => void }) {
  const nav = useNavigate()
  const press = useLongPress(onMenu, () => nav(`/c/${c.id}`))
  const name = c.name ?? 'Discussion'
  return (
    <div className="conv-row" {...press} role="button" tabIndex={0}>
      <button className="avatar-btn" aria-label="Paramètres" onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}
        onClick={() => nav(`/c/${c.id}/settings`)}>
        <Avatar name={name} url={c.avatar_url} group={c.is_group} />
      </button>
      <div className="conv-main">
        <div className="conv-name">{name}</div>
        <div className="conv-last">{c.last_content ? `${c.last_author ?? '?'} : ${c.last_content}` : <i>Aucun message</i>}</div>
      </div>
      <div className="conv-meta">
        <span className="conv-date">{shortDate(c.last_message_at)}</span>
        {c.unread > 0 && <span className="badge">{c.unread}</span>}
      </div>
    </div>
  )
}
