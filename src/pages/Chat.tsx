import { ask, notify } from '../components/Dialog'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase, errMsg, isPinned, type Member, type Message } from '../lib/supabase'
import { useMe } from '../lib/auth'
import { useConversation } from '../lib/conversation'
import { messageDate, remaining } from '../lib/format'
import { Screen } from '../components/Layout'
import { Avatar } from '../components/Avatar'
import { IconBack, IconDown, IconPin, IconSend } from '../components/Icons'
import { Sheet, SheetButton } from '../components/Sheet'
import { useLongPress } from '../components/useLongPress'

const PIN_DURATIONS: { label: string; ms: number | null }[] = [
  { label: '1 heure', ms: 3600e3 },
  { label: '1 jour', ms: 86400e3 },
  { label: '1 semaine', ms: 7 * 86400e3 },
  { label: 'Sans limite', ms: null },
]

export default function Chat() {
  const { id = '' } = useParams()
  const me = useMe()
  const nav = useNavigate()
  const c = useConversation(id, me)
  const [messages, setMessages] = useState<Message[]>([])
  const [pinnedOnly, setPinnedOnly] = useState(false)
  const [selected, setSelected] = useState<Message | null>(null)
  const [pinDate, setPinDate] = useState('')
  const [, tick] = useState(0)
  const bottom = useRef<HTMLDivElement>(null)

  const markRead = useCallback(() => {
    supabase.from('members').update({ last_read_at: new Date().toISOString() }).eq('conversation_id', id).eq('user_id', me).then()
  }, [id, me])

  useEffect(() => {
    supabase.from('messages').select('*').eq('conversation_id', id).order('created_at', { ascending: false }).limit(300)
      .then(({ data }) => setMessages(((data ?? []) as Message[]).reverse()))
    markRead()
    const ch = supabase.channel(`msgs-${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` },
        (p) => { setMessages((ms) => ms.some((m) => m.id === p.new.id) ? ms : [...ms, p.new as Message]); markRead() })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` },
        (p) => setMessages((ms) => ms.map((m) => (m.id === p.new.id ? (p.new as Message) : m))))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' },
        (p) => setMessages((ms) => ms.filter((m) => m.id !== (p.old as { id: number }).id)))
      .subscribe()
    // rafraîchit les durées d'épinglage restantes
    const t = window.setInterval(() => tick((x) => x + 1), 60e3)
    return () => { supabase.removeChannel(ch); window.clearInterval(t) }
  }, [id, markRead])

  const shown = pinnedOnly ? messages.filter((m) => isPinned(m)) : messages
  useLayoutEffect(() => { bottom.current?.scrollIntoView() }, [shown.length])

  if (c.notFound) return <Screen header={<><Link to="/" className="icon-btn"><IconBack /></Link><h1>Introuvable</h1><span className="icon-btn" /></>}><p className="empty">Cette conversation n'existe plus ou tu n'en fais plus partie.</p></Screen>

  const names = new Map(c.members.map((m) => [m.user_id, m.profiles?.display_name ?? '?']))

  const act = async (fn: () => PromiseLike<{ error: unknown }>) => {
    const { error } = await fn()
    if (error) notify(errMsg(error))
    setSelected(null); setPinDate('')
  }
  const pin = (until: Date | null) => selected && act(() => supabase.rpc('pin_message', { msg: selected.id, until: until?.toISOString() ?? null }))

  return (
    <Screen header={<>
      <button className="icon-btn" onClick={() => nav('/')} aria-label="Retour"><IconBack /></button>
      <Link to={`/c/${id}/settings`} className="chat-title">
        <Avatar name={c.title} url={c.conv?.is_group ? c.conv.avatar_url : c.other?.avatar_url} size={34} group={c.conv?.is_group} />
        <span>{c.title}</span>
      </Link>
      <button className="icon-btn" disabled aria-label="Bientôt"><IconDown /></button>
      <button className={`icon-btn pin-filter${pinnedOnly ? ' on' : ''}`} onClick={() => setPinnedOnly(!pinnedOnly)}
        aria-pressed={pinnedOnly} aria-label="Afficher uniquement les messages épinglés"><IconPin filled={pinnedOnly} /></button>
    </>} footer={!pinnedOnly && c.mine && <Composer convId={id} members={c.members} me={me} />}>
      <div className="messages">
        {pinnedOnly && shown.length === 0 && <p className="empty">Aucun message épinglé.</p>}
        {shown.map((m) => (
          <Bubble key={m.id} m={m} mine={m.author_id === me} author={names.get(m.author_id ?? '') ?? 'Ancien membre'}
            names={names} me={me} onMenu={() => setSelected(m)} />
        ))}
        <div ref={bottom} />
      </div>

      <Sheet open={!!selected} onClose={() => { setSelected(null); setPinDate('') }} title="Message">
        {selected && <>
          {c.canPin && <>
            {isPinned(selected) && <div className="pin-status">
              <IconPin size={16} filled /> Épinglé {selected.pinned_until ? `jusqu'au ${new Date(selected.pinned_until).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}` : 'sans limite'}
            </div>}
            <div className="sheet-section">{isPinned(selected) ? 'Changer la durée :' : 'Épingler pendant…'}</div>
            <div className="pin-grid">
              {PIN_DURATIONS.map((d) => (
                <button key={d.label} className="btn" onClick={() => pin(d.ms ? new Date(Date.now() + d.ms) : null)}>{d.label}</button>
              ))}
            </div>
            <div className="sheet-section">…ou jusqu'au</div>
            <div className="inline-form">
              <input type="datetime-local" value={pinDate} onChange={(e) => setPinDate(e.target.value)} />
              <button className="btn" disabled={!pinDate || new Date(pinDate) <= new Date()} onClick={() => pin(new Date(pinDate))}>OK</button>
            </div>
            {isPinned(selected) && <SheetButton onClick={() => act(() => supabase.rpc('unpin_message', { msg: selected.id }))}>Désépingler</SheetButton>}
          </>}
          <SheetButton onClick={() => { navigator.clipboard?.writeText(selected.content); setSelected(null) }}>Copier</SheetButton>
          {(selected.author_id === me || (c.isAdmin && c.conv?.is_group)) && <>
            <div className="sheet-sep" />
            <SheetButton danger onClick={async () => (await ask('Supprimer ce message ?')) && act(() => supabase.rpc('delete_message', { msg: selected.id }))}>Supprimer</SheetButton>
          </>}
        </>}
      </Sheet>
    </Screen>
  )
}

function Bubble({ m, mine, author, names, me, onMenu }: { m: Message; mine: boolean; author: string; names: Map<string, string>; me: string; onMenu: () => void }) {
  const press = useLongPress(onMenu)
  const pinned = isPinned(m)
  const mentionsMe = m.mention_all || m.mentions.includes(me)
  return (
    <div className={`bubble${mine ? ' mine' : ''}${pinned ? ' pinned' : ''}${mentionsMe && !mine ? ' mentioned' : ''}`} {...press}>
      <div className="bubble-head">
        {!mine && <b>{author}</b>}{!mine && ' - '}{messageDate(m.created_at)}
        {pinned && <span className="pin-info"><IconPin size={14} filled /> <i>{remaining(m.pinned_until)}</i></span>}
      </div>
      <div className="bubble-text">{renderMentions(m.content, names)}</div>
    </div>
  )
}

/** Met en évidence les @mentions connues */
function renderMentions(text: string, names: Map<string, string>) {
  const tokens = ['tous', ...names.values()].sort((a, b) => b.length - a.length).map(escapeRe)
  if (!tokens.length) return text
  const re = new RegExp(`(@(?:${tokens.join('|')}))`, 'g')
  return text.split(re).map((part, i) => (i % 2 ? <span key={i} className="mention">{part}</span> : part))
}
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function Composer({ convId, members, me }: { convId: string; members: Member[]; me: string }) {
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const input = useRef<HTMLTextAreaElement>(null)
  const others = useMemo(() => members.filter((m) => m.user_id !== me && m.profiles), [members, me])

  // Suggestions quand le mot en cours commence par @
  const query = /(?:^|\s)@([^\s@]*)$/.exec(text)?.[1]
  const suggestions = query === undefined ? [] : [
    ...('tous'.startsWith(query.toLowerCase()) ? [{ id: '*', name: 'tous' }] : []),
    ...others.map((m) => ({ id: m.user_id, name: m.profiles!.display_name }))
      .filter((s) => s.name.toLowerCase().startsWith(query.toLowerCase())),
  ]

  const pick = (name: string) => {
    setText((t) => t.replace(/@([^\s@]*)$/, `@${name} `))
    input.current?.focus()
  }

  const send = async () => {
    const content = text.trim()
    if (!content || sending) return
    const mentions = others.filter((m) => content.includes(`@${m.profiles!.display_name}`)).map((m) => m.user_id)
    setSending(true)
    const { error } = await supabase.from('messages').insert({
      conversation_id: convId, author_id: me, content, mentions, mention_all: /(^|\s)@tous\b/.test(content),
    })
    setSending(false)
    if (error) return notify(errMsg(error))
    setText('')
    input.current?.focus()
  }

  return (
    <div className="composer-wrap">
      {suggestions.length > 0 && (
        <div className="suggestions">
          {suggestions.map((s) => (
            <button key={s.id} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(s.name)}>
              {s.id === '*' ? <b>@tous</b> : <><Avatar name={s.name} size={24} /> {s.name}</>}
            </button>
          ))}
        </div>
      )}
      <div className="composer">
        <textarea ref={input} rows={1} placeholder="Message… (@ pour mentionner)" value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) { e.preventDefault(); send() } }} />
        <button className="send" onClick={send} disabled={!text.trim() || sending} aria-label="Envoyer"><IconSend /></button>
      </div>
    </div>
  )
}
