import { HeaderMenu } from '../components/HeaderMenu'
import { PollCard } from '../components/PollCard'
import { BackButton } from '../components/BackButton'
import { ask, notify } from '../components/Dialog'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { supabase, errMsg, isPinned, type Member, type Message } from '../lib/supabase'
import { useMe } from '../lib/auth'
import { queueMessage, readCache, writeCache, useOnResume, usePending, dropPending, retryPending, type Pending } from '../lib/network'
import { useConversation } from '../lib/conversation'
import { messageDate, remaining } from '../lib/format'
import { Screen } from '../components/Layout'
import { Avatar } from '../components/Avatar'
import { IconPin, IconSend } from '../components/Icons'
import { Sheet, SheetButton } from '../components/Sheet'
import { useLongPress } from '../components/useLongPress'
import { useDecrypted, usePins, keyChanged, type Plain } from '../lib/e2ee'

const PIN_DURATIONS: { label: string; ms: number | null }[] = [
  { label: '1 heure', ms: 3600e3 },
  { label: '1 jour', ms: 86400e3 },
  { label: '1 semaine', ms: 7 * 86400e3 },
  { label: 'Sans limite', ms: null },
]

export default function Chat() {
  const { id = '' } = useParams()
  const backTo = (useLocation().state as { from?: string } | null)?.from ?? '/'
  const me = useMe()
  const c = useConversation(id, me)
  const [messages, setMessages] = useState<Message[]>(() => readCache<Message[]>(`msgs:${id}`, []))
  const pending = usePending(id)
  const [pinnedOnly, setPinnedOnly] = useState(false)
  const [selected, setSelected] = useState<Message | null>(null)
  const [pinDate, setPinDate] = useState('')
  const [, tick] = useState(0)
  const bottom = useRef<HTMLDivElement>(null)
  const plainOf = useDecrypted(messages)
  usePins()

  const markRead = useCallback(() => {
    supabase.from('members').update({ last_read_at: new Date().toISOString() }).eq('conversation_id', id).eq('user_id', me).then()
  }, [id, me])

  // Chargement (et rechargement au retour du réseau, pour rattraper les messages manqués)
  const load = useCallback(async () => {
    const { data, error } = await supabase.from('messages').select('*').eq('conversation_id', id)
      .order('created_at', { ascending: false }).limit(300)
    if (error) return
    const ms = (data as Message[]).reverse()
    setMessages(ms); writeCache(`msgs:${id}`, ms.slice(-100))
    markRead()
  }, [id, markRead])
  useOnResume(load)

  useEffect(() => {
    load()
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
  }, [id, markRead, load])

  const pinnedCount = messages.filter((m) => isPinned(m)).length
  const sentIds = new Set(messages.map((m) => m.client_id))
  const waiting = pending.filter((p) => !sentIds.has(p.client_id))
  useLayoutEffect(() => { bottom.current?.scrollIntoView() }, [messages.length, waiting.length])
  // Filtre épinglés : les autres messages se replient (CSS) ; on suit le bas pendant l'animation
  useEffect(() => {
    const end = Date.now() + 400
    let raf = 0
    const follow = () => { bottom.current?.scrollIntoView({ block: 'end' }); if (Date.now() < end) raf = requestAnimationFrame(follow) }
    follow()
    return () => cancelAnimationFrame(raf)
  }, [pinnedOnly])
  // Clavier ouvert / fermé : on garde les derniers messages visibles, comme WhatsApp
  useEffect(() => {
    const keep = () => bottom.current?.scrollIntoView({ block: 'end' })
    window.addEventListener('app-resize', keep)
    return () => window.removeEventListener('app-resize', keep)
  }, [])

  if (c.notFound) return <Screen header={<><BackButton to="/" /><h1>Introuvable</h1><span className="icon-btn" /></>}><p className="empty">Cette conversation n'existe plus ou tu n'en fais plus partie.</p></Screen>

  const names = new Map(c.members.map((m) => [m.user_id, m.profiles?.display_name ?? '?']))
  // Messages + envois en cours, puis regroupés : même auteur à moins de 5 min = une seule bulle.
  // Clé = client_id quand il existe : l'envoi en cours devient le message reçu sans rien redessiner.
  const items: Item[] = [
    ...messages.map((m) => ({ key: m.client_id ?? `m${m.id}`, m, author: m.author_id, created_at: m.created_at })),
    ...waiting.map((p) => ({ key: p.client_id, p, author: p.author_id, created_at: p.created_at })),
  ]
  const groups: Item[][] = []
  items.forEach((it, i) => {
    const prev = items[i - 1]
    // un sondage ou un message épinglé a sa propre bulle (jaune pour l'épinglé)
    const alone = (x: Item) => !!x.m && (!!x.m.poll_id || isPinned(x.m))
    if (prev && follows(prev, it) && !alone(prev) && !alone(it)) groups[groups.length - 1].push(it)
    else groups.push([it])
  })
  const changed = c.members.filter((m) => keyChanged(m.user_id))
  const selPlain = selected && plainOf(selected)

  const act = async (fn: () => PromiseLike<{ error: unknown }>) => {
    const { error } = await fn()
    if (error) notify(errMsg(error))
    setSelected(null); setPinDate('')
  }
  const pin = (until: Date | null) => selected && act(() => supabase.rpc('pin_message', { msg: selected.id, until: until?.toISOString() ?? null }))

  return (
    <Screen header={<>
      <BackButton to={backTo} />
      <Link to={`/c/${id}/settings`} className="chat-title">
        <Avatar name={c.title} url={c.conv?.is_group ? c.conv.avatar_url : c.other?.avatar_url} size={34} group={c.members.length > 2} />
        <span>{c.title}</span>
      </Link>
      <HeaderMenu convId={id} />
      <button className={`icon-btn pin-filter${pinnedOnly ? ' on' : ''}`} onClick={() => setPinnedOnly(!pinnedOnly)}
        aria-pressed={pinnedOnly} aria-label="Afficher uniquement les messages épinglés"><IconPin filled={pinnedOnly} /></button>
    </>} footer={!pinnedOnly && c.mine && (c.can('write')
      ? <Composer convId={id} members={c.members} me={me} canMentionAll={c.can('mention_all')} />
      : <div className="composer-locked">Seuls les admins peuvent écrire dans ce groupe.</div>)}>
      {changed.length > 0 && <Link to={`/c/${id}/settings#securite`} className="key-alert">
        ⚠️ La clé de sécurité de {changed.map((m) => m.profiles?.display_name ?? '?').join(', ')} a changé. Vérifie-la avant d'écrire.
      </Link>}
      <div className="messages">
        {pinnedOnly && pinnedCount === 0 && <p className="empty fade-in">Aucun message épinglé.</p>}
        {groups.map((g) => {
          const first = g[0]
          const mine = first.author === me
          const pinnedLine = (it: Item) => !!it.m && isPinned(it.m)
          return <Fold key={first.key} hidden={pinnedOnly && !g.some(pinnedLine)}>
            <div className={`bubble${mine ? ' mine' : ''}${g.some((it) => it.m?.poll_id) ? ' has-poll' : ''}${g.every(pinnedLine) ? ' pinned' : ''}${!mine && g.some((it) => { const pl = it.m && plainOf(it.m); return !!pl && (pl.mention_all || pl.mentions.includes(me)) }) ? ' mentioned' : ''}`}>
              <div className="bubble-head">{!mine && <><b>{names.get(first.author ?? '') ?? 'Ancien membre'}</b> - </>}{messageDate(first.created_at)}</div>
              {g.map((it, j) => <Fold key={it.key} line hidden={pinnedOnly && !pinnedLine(it)}>
                {it.m ? <Line m={it.m} plain={plainOf(it.m)} mine={mine} names={names} first={j === 0} last={j === g.length - 1}
                    onMenu={() => setSelected(it.m!)} />
                  : <PendingLine p={it.p!} />}
              </Fold>)}
            </div>
          </Fold>
        })}
        <div ref={bottom} />
      </div>

      <Sheet open={!!selected} onClose={() => { setSelected(null); setPinDate('') }} title="Message">
        {selected && <>
          {c.can('pin') && <>
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
          {selPlain?.text && <SheetButton onClick={() => { navigator.clipboard?.writeText(selPlain.text); setSelected(null) }}>Copier</SheetButton>}
          {(selected.author_id === me || c.can('delete_others')) && <>
            <div className="sheet-sep" />
            <SheetButton danger onClick={async () => (await ask('Supprimer ce message ?')) && act(() => supabase.rpc('delete_message', { msg: selected.id }))}>Supprimer</SheetButton>
          </>}
        </>}
      </Sheet>
    </Screen>
  )
}

/** Enveloppe qui replie / déplie son contenu en fondu (filtre des messages épinglés) ; `line` : une ligne dans une bulle */
function Fold({ hidden, line, children }: { hidden: boolean; line?: boolean; children: React.ReactNode }) {
  return <div className={`fold${hidden ? ' out' : ''}${line ? ' line' : ''}`} aria-hidden={hidden}><div className="fold-in">{children}</div></div>
}

type Item = { key: string; m?: Message; p?: Pending; author: string | null; created_at: string }
/** Même auteur, à moins de 5 minutes d'écart : même bulle */
const follows = (prev: Item, it: Item) =>
  !!it.author && prev.author === it.author && Date.parse(it.created_at) - Date.parse(prev.created_at) < 5 * 60_000

/** Une ligne d'une bulle = un message (appui long : épingler, supprimer…) ; petite coche quand il est arrivé */
function Line({ m, plain, mine, names, onMenu, first, last }: { m: Message; plain: Plain | undefined; mine: boolean; names: Map<string, string>; onMenu: () => void; first: boolean; last: boolean }) {
  const press = useLongPress(onMenu)
  const pinned = isPinned(m)
  const legacy = plain?.status === 'legacy' && !m.poll_id && first
  return (
    <div className={`line${pinned ? ' pinned' : ''}`} {...press}>
      {(pinned || legacy || plain?.status === 'unverified') && <div className="bubble-head">
        {legacy && <span className="e2ee-tag" title="Envoyé avant le chiffrement de bout en bout">non chiffré</span>}
        {plain?.status === 'unverified' && <span className="e2ee-tag warn" title="Signature valide, mais la clé de l'auteur n'est pas confirmée">clé non confirmée</span>}
        {pinned && <span className="pin-info"><IconPin size={14} filled /> <i>{remaining(m.pinned_until)}</i></span>}
      </div>}
      <div className="bubble-text">{!plain ? <i className="muted">🔒 Déchiffrement…</i>
        : plain.status === 'locked' ? <i className="muted">🔒 Message illisible : envoyé avant ton arrivée ou avec une ancienne phrase</i>
        : plain.status === 'invalid' ? <i className="muted">⚠️ Message altéré ou signature invalide</i>
        : renderMentions(plain.text, names)}
        {mine && last && <span className="tick" aria-label="Envoyé">✓</span>}</div>
      {m.poll_id && <PollCard pollId={m.poll_id} compact />}
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

function Composer({ convId, members, me, canMentionAll }: { convId: string; members: Member[]; me: string; canMentionAll: boolean }) {
  const [text, setText] = useState('')
  const input = useRef<HTMLTextAreaElement>(null)
  const others = useMemo(() => members.filter((m) => m.user_id !== me && m.profiles), [members, me])

  // Suggestions quand le mot en cours commence par @
  const query = /(?:^|\s)@([^\s@]*)$/.exec(text)?.[1]
  const suggestions = query === undefined ? [] : [
    ...(canMentionAll && 'tous'.startsWith(query.toLowerCase()) ? [{ id: '*', name: 'tous' }] : []),
    ...others.map((m) => ({ id: m.user_id, name: m.profiles!.display_name }))
      .filter((s) => s.name.toLowerCase().startsWith(query.toLowerCase())),
  ]

  const pick = (name: string) => {
    setText((t) => t.replace(/@([^\s@]*)$/, `@${name} `))
    input.current?.focus()
  }

  const send = async () => {
    const content = text.trim()
    if (!content) return
    const mentions = others.filter((m) => content.includes(`@${m.profiles!.display_name}`)).map((m) => m.user_id)
    // Le message part dans la file d'attente : envoyé tout de suite, ou au retour du réseau
    queueMessage({ conversation_id: convId, author_id: me, content, mentions, mention_all: canMentionAll && /(^|\s)@tous\b/.test(content) })
    setText('')
    input.current?.focus()
  }

  return (
    <div className="composer-wrap">
      {suggestions.length > 0 && (
        <div className="suggestions">
          {suggestions.map((s) => (
            <button key={s.id} onPointerDown={(e) => e.preventDefault()} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(s.name)}>
              {s.id === '*' ? <b>@tous</b> : <><Avatar name={s.name} size={24} /> {s.name}</>}
            </button>
          ))}
        </div>
      )}
      <div className="composer">
        <textarea ref={input} rows={1} placeholder="Message… (@ pour mentionner)" value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) { e.preventDefault(); send() } }} />
        <button className="send" onPointerDown={(e) => e.preventDefault()} onMouseDown={(e) => e.preventDefault()} onClick={send} disabled={!text.trim()} aria-label="Envoyer"><IconSend /></button>
      </div>
    </div>
  )
}

/** Message en cours d'envoi : affiché tout de suite comme les autres (fondu doux). L'état « en attente de réseau »
 *  n'apparaît que hors ligne ou si l'envoi traîne plus de 2 secondes ; en cas d'échec, Réessayer / Supprimer. */
function PendingLine({ p }: { p: Pending }) {
  const [slow, setSlow] = useState(() => !navigator.onLine || Date.now() - Date.parse(p.created_at) > 2000)
  useEffect(() => {
    if (slow) return
    const t = setTimeout(() => setSlow(true), Math.max(0, 2000 - (Date.now() - Date.parse(p.created_at))))
    return () => clearTimeout(t)
  }, [slow, p.created_at])
  return (
    <div className={`line new${p.failed ? ' failed' : slow ? ' slow' : ''}`}>
      <div className="bubble-text">{p.content}</div>
      {p.failed ? <>
        <div className="line-status">⚠️ Non envoyé</div>
        <div className="pending-actions">
          <button onClick={() => retryPending(p.client_id)}>Réessayer</button>
          <button onClick={() => dropPending(p.client_id)}>Supprimer</button>
        </div>
      </> : slow && <div className="line-status"><span className="spinner" aria-hidden /> En attente de réseau</div>}
    </div>
  )
}
