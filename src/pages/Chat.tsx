import { HeaderMenu } from '../components/HeaderMenu'
import { PollCard } from '../components/PollCard'
import { BackButton } from '../components/BackButton'
import { ask, notify } from '../components/Dialog'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { supabase, errMsg, isPinned, type Member, type Message } from '../lib/supabase'
import { useAuth, useMe } from '../lib/auth'
import { queueMessage, readCache, writeCache, useOnResume, usePending, dropPending, retryPending, onSent, type Pending } from '../lib/network'
import { useConversation } from '../lib/conversation'
import { eventLabel, hhmm, remaining } from '../lib/format'
import { Screen } from '../components/Layout'
import { Avatar, colorOf } from '../components/Avatar'
import { IconCheck, IconClose, IconFilter, IconPin, IconPoll, IconBell, IconSend, IconCamera, IconImage, IconCopy, IconTrash, IconMore, IconReply, IconChat, IconArrowDown } from '../components/Icons'
import { ToolIcon } from '../components/ToolIcon'
import { Sheet, SheetButton } from '../components/Sheet'
import { useLongPress, swallowNextClick } from '../components/useLongPress'
import { Photo, Lightbox } from '../components/Photo'
import { PhotoEditor } from '../components/PhotoEditor'
import { uploadPhoto, type PhotoRef } from '../lib/media'
import { useDecrypted, type Plain, type ReplyRef } from '../lib/e2ee'
import { EmptyState } from '../components/EmptyState'

const PIN_DURATIONS: { label: string; ms: number | null }[] = [
  { label: '1 heure', ms: 3600e3 },
  { label: '1 jour', ms: 86400e3 },
  { label: '1 semaine', ms: 7 * 86400e3 },
  { label: 'Sans limite', ms: null },
]

/** Critères combinables : des types (épinglés, sondages, activité des outils) OU entre eux, ET des auteurs (OU entre eux) */
type Kind = 'pinned' | 'polls' | 'activity'
type Filter = { kinds: Kind[]; authors: string[] }
const NO_FILTER: Filter = { kinds: [], authors: [] }
const flip = <T,>(xs: T[], x: T) => xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]
/** Réactions proposées à l'appui court sur un message */
const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🎉']
type Reaction = { message_id: number; user_id: string; emoji: string }
const TOOL_PATH = { list: 'notes', ledger: 'accounts', poll: 'polls', event: 'calendar' } as const
const TOOL_KIND = TOOL_PATH

export default function Chat() {
  const { id = '' } = useParams()
  const backTo = (useLocation().state as { from?: string } | null)?.from ?? '/'
  const me = useMe()
  const { profile } = useAuth()
  const nav = useNavigate()
  const c = useConversation(id, me)
  const [messages, setMessages] = useState<Message[]>(() => readCache<Message[]>(`msgs:${id}`, []))
  const pending = usePending(id)
  // Filtre multicritère ; `since` = moment où il a été activé (pour compter les nouveaux messages qu'il masque)
  const [filter, setFilterRaw] = useState<Filter>(NO_FILTER)
  const [since, setSince] = useState(0)
  const active = filter.kinds.length + filter.authors.length > 0
  const setFilter = (f: Filter) => {
    const on = f.kinds.length + f.authors.length > 0
    if (on && !active) setSince(Date.now())
    setFilterRaw(f)
  }
  const [filterOpen, setFilterOpen] = useState(false)
  const [selected, setSelected] = useState<Message | null>(null)
  // appui court : réagir avec un smiley ou épingler
  const [quick, setQuick] = useState<Message | null>(null)
  const [reactions, setReactions] = useState<Reaction[]>([])
  const bubbleTap = useRef<{ x: number; y: number; t: number } | null>(null)
  // rangée ouverte : un toucher ailleurs (hors bulles et rangée) la ferme
  useEffect(() => {
    if (!quick) return
    const close = (e: PointerEvent) => { if (!(e.target as HTMLElement).closest('.quick-bar, .bubble')) setQuick(null) }
    document.addEventListener('pointerdown', close, true)
    return () => document.removeEventListener('pointerdown', close, true)
  }, [quick])
  const [pinDate, setPinDate] = useState('')
  const [viewPhoto, setViewPhoto] = useState<PhotoRef | null>(null)
  const [, tick] = useState(0)
  const bottom = useRef<HTMLDivElement>(null)
  const plainOf = useDecrypted(messages)
  const [loaded, setLoaded] = useState(() => messages.length > 0)
  // réponse en cours (glisser un message vers la droite)
  const [reply, setReply] = useState<ReplyRef | null>(null)
  useEffect(() => setReply(null), [id])
  // Bas du fil : on suit les nouveaux messages seulement si on y est ; sinon bouton ↓ avec le nombre de nouveaux
  const [atBottom, setAtBottom] = useState(true)
  const atBottomRef = useRef(true)
  const seen = useRef(new Set<number>())
  const msgsRef = useRef(messages); msgsRef.current = messages
  const markSeen = () => { seen.current = new Set(msgsRef.current.map((m) => m.id)) }
  useEffect(() => {
    const el = bottom.current?.closest('.content') as HTMLElement | null
    if (!el) return
    const on = () => {
      const b = el.scrollHeight - el.scrollTop - el.clientHeight < 150
      atBottomRef.current = b; setAtBottom(b)
      if (b) markSeen()
    }
    el.addEventListener('scroll', on, { passive: true })
    // zone qui rétrécit (clavier, citation de réponse) ou contenu qui grandit (photo chargée) : on reste en bas si on y était
    const ro = new ResizeObserver(() => { if (atBottomRef.current) bottom.current?.scrollIntoView({ block: 'end' }) })
    ro.observe(el); if (el.firstElementChild) ro.observe(el.firstElementChild)
    return () => { el.removeEventListener('scroll', on); ro.disconnect() }
  }, [])
  const toBottom = () => bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })

  const markRead = useCallback(() => {
    supabase.from('members').update({ last_read_at: new Date().toISOString() }).eq('conversation_id', id).eq('user_id', me).then()
  }, [id, me])

  // Chargement (et rechargement au retour du réseau, pour rattraper les messages manqués)
  const load = useCallback(async () => {
    const { data, error } = await supabase.from('messages').select('*').eq('conversation_id', id)
      .order('created_at', { ascending: false }).limit(300)
    if (error) return
    const ms = (data as Message[]).reverse()
    setMessages(ms); writeCache(`msgs:${id}`, ms.slice(-100)); setLoaded(true)
    markRead()
  }, [id, markRead])
  useOnResume(load)
  const loadReactions = useCallback(async () => {
    const { data, error } = await supabase.from('message_reactions').select('message_id, user_id, emoji, messages!inner(conversation_id)').eq('messages.conversation_id', id)
    if (!error && data) setReactions((data as unknown as Reaction[]).map(({ message_id, user_id, emoji }) => ({ message_id, user_id, emoji })))
  }, [id])
  useEffect(() => {
    loadReactions()
    let t = 0
    const soon = () => { clearTimeout(t); t = window.setTimeout(loadReactions, 250) }
    const ch = supabase.channel(`reacts-${id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, soon).subscribe()
    return () => { clearTimeout(t); supabase.removeChannel(ch) }
  }, [id, loadReactions])
  useOnResume(loadReactions)
  // même smiley = on retire sa réaction ; autre smiley = on la remplace
  const react = async (m: Message, emoji: string) => {
    setQuick(null)
    const mine = reactions.find((r) => r.message_id === m.id && r.user_id === me)
    const off = mine?.emoji === emoji
    setReactions((rs) => [...rs.filter((r) => !(r.message_id === m.id && r.user_id === me)), ...(off ? [] : [{ message_id: m.id, user_id: me, emoji }])])
    const { error } = off
      ? await supabase.from('message_reactions').delete().eq('message_id', m.id).eq('user_id', me)
      : await supabase.from('message_reactions').upsert({ message_id: m.id, user_id: me, emoji })
    if (error) { notify(errMsg(error)); loadReactions() }
  }

  useEffect(() => {
    load()
    const ch = supabase.channel(`msgs-${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` },
        (p) => { setMessages((ms) => ms.some((m) => m.id === p.new.id) ? ms : [...ms, p.new as Message]); markRead() })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` },
        // Les grosses colonnes inchangées (message chiffré d'une photo) ne sont pas renvoyées lors d'une modif
        // (épinglage) : on garde celles qu'on a, sinon la photo disparaît jusqu'au rechargement
        (p) => setMessages((ms) => ms.map((m) => (m.id === p.new.id ? keepBig(m, p.new as Message) : m))))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' },
        (p) => setMessages((ms) => ms.filter((m) => m.id !== (p.old as { id: number }).id)))
      .subscribe()
    const off = onSent((m) => { if (m.conversation_id === id) setMessages((ms) => ms.some((x) => x.id === m.id) ? ms : [...ms, m]) })
    // rafraîchit les durées d'épinglage restantes
    const t = window.setInterval(() => tick((x) => x + 1), 60e3)
    return () => { supabase.removeChannel(ch); window.clearInterval(t); off() }
  }, [id, markRead, load])

  const keepMsg = (m: Message) => (!filter.kinds.length || filter.kinds.some((k) => k === 'pinned' ? isPinned(m) : k === 'polls' ? !!m.poll_id : m.kind === 'activity'))
    && (!filter.authors.length || filter.authors.includes(m.author_id ?? ''))
  const keep = (it: Item) => !active || (!!it.m && keepMsg(it.m))
  const sentIds = new Set(messages.map((m) => m.client_id))
  const waiting = pending.filter((p) => !sentIds.has(p.client_id))
  // Bas de la conversation : d'un coup à l'ouverture, en douceur quand un message arrive
  const opened = useRef(false)
  const openedAt = useRef(Date.now())
  const lastWaiting = useRef(waiting.length)
  useLayoutEffect(() => {
    const sending = waiting.length > lastWaiting.current
    lastWaiting.current = waiting.length
    if (!opened.current || !messages.length) bottom.current?.scrollIntoView()
    else if (atBottomRef.current || sending) bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
    else return
    opened.current = messages.length > 0
    markSeen()
  }, [messages.length, waiting.length]) // eslint-disable-line react-hooks/exhaustive-deps
  // Filtre épinglés : les autres messages se replient (CSS) ; on suit le bas pendant l'animation
  useEffect(() => {
    const end = Date.now() + 400
    let raf = 0
    const follow = () => { bottom.current?.scrollIntoView({ block: 'end' }); if (Date.now() < end) raf = requestAnimationFrame(follow) }
    follow()
    return () => cancelAnimationFrame(raf)
  }, [filter.kinds.join(), filter.authors.join()]) // eslint-disable-line react-hooks/exhaustive-deps
  // Clavier ouvert / fermé : on garde les derniers messages visibles, comme WhatsApp
  useEffect(() => {
    const keep = () => { if (atBottomRef.current) bottom.current?.scrollIntoView({ block: 'end' }) }
    window.addEventListener('app-resize', keep)
    return () => window.removeEventListener('app-resize', keep)
  }, [])

  if (c.notFound) return <Screen header={<><BackButton to="/" /><h1>Introuvable</h1><span className="icon-btn" /></>}><p className="empty">Cette conversation n'existe plus ou tu n'en fais plus partie.</p></Screen>

  // Activité des outils (par outil) : réglage de la conv, sinon celui par défaut (Paramètres). Le filtre « Activité » la montre toujours.
  const showTools = c.mine?.show_tools ?? profile?.show_tools_default ?? []
  // conversation supprimée puis revenue (nouveau message) : l'ancien historique reste effacé pour moi
  const hiddenAt = c.mine?.hidden_at ?? null
  const visible = hiddenAt ? messages.filter((m) => m.created_at > hiddenAt) : messages
  const shown = filter.kinds.includes('activity') ? visible : visible.filter((m) => m.kind !== 'activity' || (!!m.tool && showTools.includes(m.tool)))
  const names = new Map(c.members.map((m) => [m.user_id, m.profiles?.display_name ?? '?']))
  // Messages + envois en cours, puis regroupés : même auteur à moins de 5 min = une seule bulle.
  // Clé = client_id quand il existe : l'envoi en cours devient le message reçu sans rien redessiner.
  const items: Item[] = [
    ...shown.map((m) => ({ key: m.client_id ?? `m${m.id}`, m, author: m.author_id, created_at: m.created_at })),
    ...waiting.map((p) => ({ key: p.client_id, p, author: p.author_id, created_at: p.created_at })),
  ]
  const groups: Item[][] = []
  items.forEach((it, i) => {
    const prev = items[i - 1]
    // un sondage ou un message épinglé a sa propre bulle (jaune pour l'épinglé)
    const alone = (x: Item) => !!x.m && (!!x.m.poll_id || isPinned(x.m) || x.m.kind === 'activity')
    if (prev && follows(prev, it) && !alone(prev) && !alone(it)) groups[groups.length - 1].push(it)
    else groups.push([it])
  })
  const selPlain = selected && plainOf(selected)
  // nouveaux messages des autres arrivés depuis l'activation du filtre et masqués par lui
  const hiddenNew = active ? shown.filter((m) => m.author_id !== me && Date.parse(m.created_at) > since && !keepMsg(m)).length : 0
  const unseen = atBottom ? 0 : shown.filter((m) => m.author_id !== me && m.kind !== 'activity' && !seen.current.has(m.id)).length
  const recent = (iso: string) => Date.parse(iso) > openedAt.current
  // Glisser vers la droite : on répond au message touché (ou au dernier de la bulle)
  const startReply = (g: Item[], target: HTMLElement) => {
    const mid = Number(target.closest<HTMLElement>('[data-mid]')?.dataset.mid)
    const m = g.find((it) => it.m?.id === mid)?.m ?? [...g].reverse().find((it) => it.m && keep(it))?.m
    if (!m) return
    const pl = plainOf(m)
    const x = pl?.text ? pl.text.slice(0, 140) : pl?.photo ? '📷 Photo' : m.poll_id ? '📊 Sondage' : '…'
    setReply({ c: m.client_id ?? `m${m.id}`, a: m.author_id, x })
  }
  // toucher la citation : on remonte au message d'origine (s'il est chargé)
  const jump = (key: string) => {
    const el = document.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`)
    if (!el) return notify('Message trop ancien : il n\'est plus affiché.')
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash')
  }
  const whoName = (uid: string | null) => uid === me ? 'Toi' : names.get(uid ?? '') ?? 'Ancien membre'
  const kindLabel = { pinned: <><IconPin size={14} filled /> Épinglés</>, polls: <><IconPoll size={14} /> Sondages</>, activity: <><IconBell size={14} /> Activité</> }

  const act = async (fn: () => PromiseLike<{ error: unknown }>) => {
    const { error } = await fn()
    if (error) notify(errMsg(error))
    setSelected(null); setPinDate('')
  }
  const pin = (until: Date | null) => selected && act(() => supabase.rpc('pin_message', { msg: selected.id, until: until?.toISOString() ?? null }))
  const quickPin = async (m: Message) => {
    setQuick(null)
    const { error } = await (isPinned(m) ? supabase.rpc('unpin_message', { msg: m.id }) : supabase.rpc('pin_message', { msg: m.id, until: null }))
    if (error) notify(errMsg(error))
  }
  const reactsOf = (mid: number) => reactions.filter((r) => r.message_id === mid)

  return (
    <Screen className="chat-screen" header={<>
      <BackButton to={backTo} />
      <Link to={`/c/${id}/settings`} className="chat-title">
        <Avatar name={c.title} url={c.conv?.is_group ? c.conv.avatar_url : c.other?.avatar_url} size={38} group={c.members.length > 2} />
        <span className="chat-title-text"><span>{c.title}</span>
          <small>{c.conv?.is_group ? `${c.members.length} membres${c.conv.event_date ? ` · ${eventLabel(c.conv.event_date)}` : ''}` : 'Infos de la discussion'}</small></span>
      </Link>
      <HeaderMenu convId={id} />
      <button className={`icon-btn chat-filter${active ? ' on' : ''}`} onClick={() => setFilterOpen(true)}
        aria-label={hiddenNew ? `Filtrer les messages (${hiddenNew} nouveaux masqués)` : 'Filtrer les messages'}><IconFilter filled={active} />
        {hiddenNew > 0 && <span className="filter-dot fade-in">{hiddenNew > 3 ? '+' : hiddenNew}</span>}</button>
    </>} footer={!active && c.mine && <div className="chat-foot">
      {!atBottom && <button className="scroll-down pop-in" onClick={toBottom} aria-label={unseen ? `${unseen} nouveaux messages` : 'Aller en bas'}>
        <IconArrowDown />{unseen > 0 && <span className="scroll-badge">{unseen > 99 ? '99+' : unseen}</span>}</button>}
      {c.can('write')
        ? <Composer key={id} convId={id} members={c.members} me={me} canMentionAll={c.can('mention_all')}
            reply={reply} replyName={reply ? whoName(reply.a) : ''} onCancelReply={() => setReply(null)} />
        : <div className="composer-locked">Seuls les admins peuvent écrire dans ce groupe.</div>}
    </div>}>
      <div className="messages">
        {active && <div className="filter-chips-bar fade-in">
          {filter.kinds.map((k) => <span key={k} className="filter-chip">{kindLabel[k]}
            <button onClick={() => setFilter({ ...filter, kinds: flip(filter.kinds, k) })} aria-label="Retirer ce critère"><IconClose size={14} /></button></span>)}
          {filter.authors.map((a) => <span key={a} className="filter-chip">
            <Avatar name={names.get(a) ?? '?'} url={c.members.find((m) => m.user_id === a)?.profiles?.avatar_url} size={20} /> {a === me ? 'Moi' : names.get(a) ?? '?'}
            <button onClick={() => setFilter({ ...filter, authors: flip(filter.authors, a) })} aria-label="Retirer ce critère"><IconClose size={14} /></button></span>)}
          {filter.kinds.length + filter.authors.length > 1 && <button className="filter-clear" onClick={() => setFilter(NO_FILTER)}>Tout effacer</button>}
        </div>}
        {active && !items.some(keep) && <p className="empty fade-in">Aucun message.</p>}
        {!loaded && !items.length && <ChatSkeleton />}
        {loaded && !active && !items.length && <EmptyState icon={<IconChat size={34} />} title="Aucun message pour l'instant"
          text={c.conv?.is_group ? 'Lance la discussion avec le groupe.' : 'Lance la discussion !'}
          action={c.mine && c.can('write') ? <button className="btn primary" onClick={() => queueMessage({ conversation_id: id, author_id: me, content: 'Salut ! 👋', mentions: [], mention_all: false })}>Dire bonjour 👋</button> : undefined} />}
        {groups.map((g, gi) => {
          const first = g[0]
          const mine = first.author === me
          const pinnedLine = (it: Item) => !!it.m && isPinned(it.m)
          const name = names.get(first.author ?? '') ?? 'Ancien membre'
          const showWho = !mine && !!c.conv?.is_group
          const day = dayLabel(first.created_at)
          const newDay = !active && (gi === 0 || dayLabel(groups[gi - 1][0].created_at) !== day)
          const arrive = !mine && recent(first.created_at) ? ' arrive' : ''
          if (first.m?.kind === 'activity') return <div key={first.key} className={`msg-block${arrive}`}>
            {newDay && <div className="day-sep"><span>{day}</span></div>}
            <Fold hidden={!keep(first)}>
              <Activity m={first.m} who={first.author === me ? 'Toi' : name}
                onOpen={() => first.m!.tool && first.m!.tool_id && nav(`/${TOOL_PATH[first.m!.tool]}/${first.m!.tool_id}`, { state: { from: `/c/${id}`, root: `/c/${id}` } })} />
            </Fold>
          </div>
          return <div key={first.key} className={`msg-block${arrive}`}>
            {newDay && <div className="day-sep"><span>{day}</span></div>}
            <Fold hidden={!g.some(keep)}>
              <SwipeRow disabled={!c.mine || !c.can('write') || active || g.every((it) => !it.m)} onSwipe={(t) => startReply(g, t)}>
              <div className={`msg-row${mine ? ' mine' : ''}`}>
                {showWho && <span className="msg-avatar"><Avatar name={name} url={c.members.find((m) => m.user_id === first.author)?.profiles?.avatar_url} size={30} /></span>}
                <div onPointerDown={(e) => { bubbleTap.current = (e.target as HTMLElement).closest('.fold.line, button, a') ? null : { x: e.clientX, y: e.clientY, t: Date.now() } }}
                  onPointerUp={(e) => {
                    // toucher le nom ou le bord de la bulle = comme toucher son dernier message
                    const d = bubbleTap.current; bubbleTap.current = null
                    const lastM = [...g].reverse().find((it) => it.m && keep(it))?.m
                    if (d && lastM && Date.now() - d.t < 450 && Math.abs(e.clientX - d.x) < 10 && Math.abs(e.clientY - d.y) < 10) setQuick((q) => q?.id === lastM.id ? null : lastM)
                  }}
                  className={`bubble${mine ? ' mine' : ''}${g.some((it) => it.m?.poll_id) ? ' has-poll' : ''}${g.every(pinnedLine) ? ' pinned' : ''}${!mine && g.some((it) => { const pl = it.m && plainOf(it.m); return !!pl && (pl.mention_all || pl.mentions.includes(me)) }) ? ' mentioned' : ''}`}>
                  {showWho && <div className="bubble-name" style={{ color: colorOf(name) }}>{name}</div>}
                  {g.map((it, j) => <Fold key={it.key} line hidden={!keep(it)} dataKey={it.key} mid={it.m?.id} arrive={j > 0 && !mine && recent(it.created_at)}>
                    {it.m ? <Line m={it.m} plain={plainOf(it.m)} mine={mine} names={names} last={j === g.length - 1} onPhoto={setViewPhoto}
                        replyName={whoName} onJump={jump}
                        onMenu={() => setSelected(it.m!)} onTap={() => setQuick((q) => q?.id === it.m!.id ? null : it.m!)}
                        reactions={reactsOf(it.m.id)} me={me} onReact={(e) => react(it.m!, e)} />
                      : <PendingLine p={it.p!} replyName={whoName} />}
                  </Fold>)}
                </div>
              </div>
              </SwipeRow>
              {quick && g.some((it) => it.m?.id === quick.id) && <QuickBar mine={mine} indent={showWho}
                picked={reactions.find((r) => r.message_id === quick.id && r.user_id === me)?.emoji}
                pinned={isPinned(quick)} canPin={c.can('pin')}
                onReact={(e) => react(quick, e)} onPin={() => quickPin(quick)} onMore={() => { const m = quick; setQuick(null); setSelected(m) }} />}
            </Fold>
          </div>
        })}
        <div ref={bottom} />
      </div>

      {/* Visionneuse : toutes les photos de la conv, de la plus ancienne à la plus récente (balayer pour passer de l'une à l'autre) */}
      <Lightbox photo={viewPhoto} photos={viewPhoto ? visible.map((m) => plainOf(m)?.photo).filter((p): p is PhotoRef => !!p) : undefined}
        onClose={() => setViewPhoto(null)} />
      <Sheet open={filterOpen} onClose={() => setFilterOpen(false)} title="Filtrer les messages">
        <div className="filter-sheet">
          <div className="filter-chips">
            {([[null, 'Tous', null, visible.length],
              ['pinned', 'Épinglés', <IconPin size={15} />, visible.filter((m) => isPinned(m)).length],
              ['polls', 'Sondages', <IconPoll size={15} />, visible.filter((m) => m.poll_id).length],
              ['activity', 'Activité', <IconBell size={15} />, visible.filter((m) => m.kind === 'activity').length]] as [Kind | null, string, React.ReactNode, number][])
              .map(([k, label, icon, n]) => (
                <button key={String(k)} className={`fchip${(k ? filter.kinds.includes(k) : !active) ? ' on' : ''}`}
                  onClick={() => setFilter(k ? { ...filter, kinds: flip(filter.kinds, k) } : NO_FILTER)} aria-pressed={k ? filter.kinds.includes(k) : !active}>
                  {icon}{label}<small>{n}</small>
                </button>
              ))}
          </div>
          <div className="sgroup-title">Messages de</div>
          <div className="sgroup-card">
            {c.members.filter((m) => m.profiles).map((m) => {
              const on = filter.authors.includes(m.user_id)
              return <button key={m.user_id} className={`srow${on ? ' on' : ''}`} onClick={() => setFilter({ ...filter, authors: flip(filter.authors, m.user_id) })} aria-pressed={on}>
                <Avatar name={m.profiles!.display_name} url={m.profiles!.avatar_url} size={28} />
                <span className="srow-text">{m.user_id === me ? 'Moi' : m.profiles!.display_name}</span>
                <span className="filter-right"><small>{visible.filter((x) => x.author_id === m.user_id && x.kind !== 'activity').length}</small>
                  <span className="round-check">{on && <IconCheck size={14} />}</span></span>
              </button>
            })}
          </div>
          <p className="muted small filter-hint">Plusieurs critères possibles : par ex. Sondages + Léa = les sondages de Léa.</p>
          <button className="btn primary wide" onClick={() => setFilterOpen(false)}>
            {active ? `Voir ${items.filter(keep).length} message${items.filter(keep).length > 1 ? 's' : ''}` : 'Fermer'}</button>
        </div>
      </Sheet>

      <Sheet open={!!selected} onClose={() => { setSelected(null); setPinDate('') }} title="Message">
        {selected && <>
          {c.can('pin') && <>
            {isPinned(selected) && <div className="pin-status">
              <IconPin size={16} filled /> Épinglé {selected.pinned_until ? `jusqu'au ${new Date(selected.pinned_until).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}` : 'sans limite'}{selected.pinned_until && ` (encore ${remaining(selected.pinned_until)})`}
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
            {isPinned(selected) && <SheetButton icon={<IconPin size={20} />} onClick={() => act(() => supabase.rpc('unpin_message', { msg: selected.id }))}>Désépingler</SheetButton>}
          </>}
          {selPlain?.text && <SheetButton icon={<IconCopy />} onClick={() => { navigator.clipboard?.writeText(selPlain.text); setSelected(null) }}>Copier</SheetButton>}
          {(selected.author_id === me || c.can('delete_others')) && <>
            <div className="sheet-sep" />
            <SheetButton danger icon={<IconTrash />} onClick={async () => (await ask('Supprimer ce message ?')) && act(() => supabase.rpc('delete_message', { msg: selected.id }))}>Supprimer</SheetButton>
          </>}
        </>}
      </Sheet>
    </Screen>
  )
}

function keepBig(old: Message, upd: Message): Message {
  const m = { ...old, ...upd }
  for (const k of ['ciphertext', 'content', 'epoch', 'client_id'] as const) if (upd[k] == null && old[k] != null) (m as Record<string, unknown>)[k] = old[k]
  return m
}

/** Enveloppe qui replie / déplie son contenu en fondu (filtre des messages épinglés) ; `line` : une ligne dans une bulle */
function Fold({ hidden, line, children, dataKey, mid, arrive }: { hidden: boolean; line?: boolean; children: React.ReactNode; dataKey?: string; mid?: number; arrive?: boolean }) {
  return <div className={`fold${hidden ? ' out' : ''}${line ? ' line' : ''}${arrive ? ' arrive' : ''}`} aria-hidden={hidden} data-key={dataKey} data-mid={mid}><div className="fold-in">{children}</div></div>
}

/** Glisser une bulle vers la droite pour y répondre. Le défilement vertical, le toucher (smileys) et l'appui long (menu)
 *  restent gérés ailleurs : le glisser ne démarre qu'après 12 px nettement horizontaux. */
function SwipeRow({ onSwipe, disabled, children }: { onSwipe: (target: HTMLElement) => void; disabled?: boolean; children: ReactNode }) {
  const [dx, setDx] = useState(0)
  const st = useRef<{ x: number; y: number; on: boolean; t: HTMLElement; dx: number; id: number } | null>(null)
  const TRIGGER = 56
  const end = (ok: boolean) => {
    const s = st.current; st.current = null
    if (!s?.on) return
    swallowNextClick()  // pas de clic (photo, lien) au relâchement
    if (ok && s.dx >= TRIGGER) onSwipe(s.t)
    setDx(0)
  }
  const p = Math.min(1, dx / TRIGGER)
  return (
    <div className={`swipe-row${dx ? ' dragging' : ''}`}
      onPointerDown={(e) => {
        if (disabled || e.button > 0 || (e.target as HTMLElement).closest('input, .poll, .react-chips, .quick-bar')) return
        st.current = { x: e.clientX, y: e.clientY, on: false, t: e.target as HTMLElement, dx: 0, id: e.pointerId }
      }}
      onPointerMove={(e) => {
        const s = st.current
        if (!s || e.pointerId !== s.id) return
        const ddx = e.clientX - s.x, ddy = e.clientY - s.y
        if (!s.on) {
          if (ddx > 12 && ddx > Math.abs(ddy) * 2) { s.on = true; try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* rien */ } }
          else if (Math.abs(ddy) > 10 || ddx < -10) { st.current = null; return }
          else return
        }
        // au-delà du seuil, la bulle résiste (comme un élastique)
        s.dx = Math.max(0, ddx < TRIGGER ? ddx : TRIGGER + (ddx - TRIGGER) * 0.25)
        setDx(Math.min(s.dx, TRIGGER + 30))
      }}
      onPointerUp={() => end(true)} onPointerCancel={() => end(false)}>
      <span className={`swipe-icon${p >= 1 ? ' ready' : ''}`} style={{ opacity: p, transform: `translateY(-50%) scale(${0.5 + 0.5 * p})` }} aria-hidden><IconReply /></span>
      <div className="swipe-body" style={dx ? { transform: `translateX(${dx}px)` } : undefined}>{children}</div>
    </div>
  )
}

/** Citation du message auquel on répond (dans la bulle, ou au-dessus de la zone de saisie) */
function Quote({ r, name, onClick }: { r: ReplyRef; name: string; onClick?: () => void }) {
  return <button type="button" className="reply-quote" onClick={onClick} style={{ ['--q' as string]: name === 'Toi' ? 'var(--primary)' : colorOf(name) }}>
    <b>{name}</b><span>{r.x}</span>
  </button>
}

/** Chargement : quelques bulles grises qui pulsent */
function ChatSkeleton() {
  return <div className="skeleton-chat" aria-label="Chargement…">
    {[62, 40, 75, 34, 55, 48].map((w, i) => <div key={i} className={`sk-bubble${i % 3 === 1 ? ' mine' : ''}`} style={{ width: `${w}%`, animationDelay: `${i * 80}ms` }} />)}
  </div>
}

/** Séparateur de jour : « Aujourd'hui », « Hier », « lundi 24 novembre » */
function dayLabel(iso: string) {
  const d = new Date(iso), t = new Date()
  const days = Math.round((new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86400e3)
  if (days === 0) return "Aujourd'hui"
  if (days === 1) return 'Hier'
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', ...(d.getFullYear() !== t.getFullYear() ? { year: 'numeric' } : {}) })
}

type Item = { key: string; m?: Message; p?: Pending; author: string | null; created_at: string }
/** Même auteur, à moins de 5 minutes d'écart : même bulle */
const follows = (prev: Item, it: Item) =>
  !!it.author && prev.author === it.author && Date.parse(it.created_at) - Date.parse(prev.created_at) < 5 * 60_000

/** Appui court sur un message : rangée de smileys + épingler, juste sous la bulle (les touches des 350 premières ms sont ignorées) */
function QuickBar({ mine, indent, picked, pinned, canPin, onReact, onPin, onMore }: {
  mine: boolean; indent: boolean; picked?: string; pinned: boolean; canPin: boolean
  onReact: (e: string) => void; onPin: () => void; onMore: () => void
}) {
  const [ready, setReady] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })  // message en bas de l'écran : la rangée reste visible
    const t = setTimeout(() => setReady(true), 350)
    return () => clearTimeout(t)
  }, [])
  return (
    <div ref={ref} className={`quick-bar${mine ? ' mine' : ''}${indent ? ' indent' : ''}`} style={ready ? undefined : { pointerEvents: 'none' }}>
      <div className="quick-emojis">
        {EMOJIS.map((e) => <button key={e} className={`react-pick${picked === e ? ' on' : ''}`} onClick={() => onReact(e)} aria-label={`Réagir ${e}`}>{e}</button>)}
        <button className="react-pick more" onClick={onMore} aria-label="Plus d'options"><IconMore size={22} /></button>
      </div>
      {canPin && <button className="quick-pin" onClick={onPin}><IconPin size={16} filled={pinned} /> {pinned ? 'Désépingler' : 'Épingler'}</button>}
    </div>
  )
}

/** Une ligne d'une bulle = un message (appui long : épingler, supprimer…) ; petite coche quand il est arrivé */
function Line({ m, plain, mine, names, onMenu, onPhoto, last, onTap, reactions, me, onReact, replyName, onJump }: {
  m: Message; plain: Plain | undefined; mine: boolean; names: Map<string, string>; onMenu: () => void; onPhoto: (p: PhotoRef) => void; last: boolean
  onTap: () => void; reactions: Reaction[]; me: string; onReact: (emoji: string) => void
  replyName: (uid: string | null) => string; onJump: (key: string) => void
}) {
  // appui court = réagir / épingler (sauf sur une photo, un sondage, un lien ou un bouton) ; appui long = toutes les options
  const press = useLongPress(onMenu, (e) => { if (!(e.target as HTMLElement).closest('button, a, input, .poll, .photo, .react-chips')) onTap() })
  const counts = new Map<string, { n: number; mine: boolean }>()
  for (const r of reactions) { const x = counts.get(r.emoji) ?? { n: 0, mine: false }; counts.set(r.emoji, { n: x.n + 1, mine: x.mine || r.user_id === me }) }
  const pinned = isPinned(m)
  const photo = plain?.photo
  return (
    <div className={`line${pinned ? ' pinned' : ''}${photo ? ' has-photo' : ''}`} {...press}>
      {plain?.reply && <Quote r={plain.reply} name={replyName(plain.reply.a)} onClick={() => onJump(plain.reply!.c)} />}
      {photo && <Photo photo={photo} onOpen={() => onPhoto(photo)} />}
      {!(photo && !plain.text) && <div className="bubble-text">{!plain ? <i className="muted">🔒 Déchiffrement…</i>
        : plain.status === 'locked' ? <i className="muted">🔒 Message illisible : envoyé avant ton arrivée ou avec une ancienne phrase</i>
        : plain.status === 'invalid' ? <i className="muted">⚠️ Message altéré ou signature invalide</i>
        : renderMentions(plain.text, names)}
        <span className="msg-meta">{hhmm(new Date(m.created_at))}
          {mine && last && <span className="tick" aria-label="Envoyé">✓</span>}</span></div>}
      {photo && !plain.text && <span className="msg-meta photo-meta">{hhmm(new Date(m.created_at))}
        {mine && last && <span className="tick" aria-label="Envoyé">✓</span>}</span>}
      {m.poll_id && <PollCard pollId={m.poll_id} compact />}
      {pinned && <div className="pin-until">{pinUntil(m.pinned_until)}</div>}
      {counts.size > 0 && <div className="react-chips">
        {[...counts].map(([e, x]) => <button key={e} className={`react-chip${x.mine ? ' mine' : ''}`} onClick={() => onReact(e)}>{e}{x.n > 1 && <small>{x.n}</small>}</button>)}
      </div>}
    </div>
  )
}

/** « Épinglé jusqu'à 18h00 (encore 3h) », « jusqu'au ven. 28 nov., 18h00 », ou « sans limite » */
function pinUntil(until: string | null) {
  if (!until) return 'Épinglé sans limite'
  const d = new Date(until)
  const today = d.toDateString() === new Date().toDateString()
  const when = today ? `à ${hhmm(d)}` : `au ${d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })}, ${hhmm(d)}`
  return `Épinglé jusqu'${when} (encore ${remaining(until)})`
}

/** Modif d'un pense-bête, d'un compte ou d'un sondage de la conv : petite carte centrée, touche = ouvre l'outil */
function Activity({ m, who, onOpen }: { m: Message; who: string; onOpen: () => void }) {
  const lines = (m.content ?? '').split('\n')
  return (
    <button className="activity" onClick={onOpen}>
      <span className="activity-head">
        {m.tool && <ToolIcon kind={TOOL_KIND[m.tool]} size={15} />}
        <b>{who}</b><span className="activity-tool">{m.tool_name}</span>
        <span className="msg-meta">{hhmm(new Date(m.created_at))}</span>
      </span>
      <span className="activity-lines">{lines.map((l, i) => <span key={i}>{l}</span>)}</span>
    </button>
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

function Composer({ convId, members, me, canMentionAll, reply, replyName, onCancelReply }: {
  convId: string; members: Member[]; me: string; canMentionAll: boolean
  reply: ReplyRef | null; replyName: string; onCancelReply: () => void
}) {
  // Brouillon gardé par conversation (survit à une mise à jour de l'appli ou à un changement de page)
  const [text, setText] = useState(() => readCache<string>(`draft:${convId}`, ''))
  useEffect(() => {
    const t = setTimeout(() => { try { if (text) writeCache(`draft:${convId}`, text); else localStorage.removeItem(`cache:draft:${convId}`) } catch { /* rien */ } }, 300)
    return () => clearTimeout(t)
  }, [text, convId])
  const input = useRef<HTMLTextAreaElement>(null)
  useEffect(() => { if (reply) input.current?.focus() }, [reply])
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

  const [file, setFile] = useState<Blob | null>(null)
  const pickFile = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setFile(f) }
  // Photo : chiffrée puis envoyée tout de suite dans Storage ; le message (avec sa clé) suit le chemin habituel
  const sendPhoto = async (canvas: HTMLCanvasElement, caption: string) => {
    const client_id = crypto.randomUUID()
    const photo = await uploadPhoto(convId, client_id, canvas)
    const mentions = others.filter((m) => caption.includes(`@${m.profiles!.display_name}`)).map((m) => m.user_id)
    queueMessage({ conversation_id: convId, author_id: me, content: caption, mentions, mention_all: canMentionAll && /(^|\s)@tous\b/.test(caption), photo, client_id, ...(reply ? { reply } : {}) })
    setFile(null); onCancelReply()
  }

  const send = async () => {
    const content = text.trim()
    if (!content) return
    const mentions = others.filter((m) => content.includes(`@${m.profiles!.display_name}`)).map((m) => m.user_id)
    // Le message part dans la file d'attente : envoyé tout de suite, ou au retour du réseau
    queueMessage({ conversation_id: convId, author_id: me, content, mentions, mention_all: canMentionAll && /(^|\s)@tous\b/.test(content), ...(reply ? { reply } : {}) })
    setText(''); onCancelReply()
    try { localStorage.removeItem(`cache:draft:${convId}`) } catch { /* rien */ }
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
      {reply && <div className="reply-bar pop-in">
        <IconReply size={18} /><Quote r={reply} name={replyName} />
        <button className="icon-btn" onClick={onCancelReply} aria-label="Annuler la réponse"><IconClose size={18} /></button>
      </div>}
      {file && <PhotoEditor file={file} onCancel={() => setFile(null)} onSend={sendPhoto} />}
      <div className="composer">
        {!text && <>
          <label className="icon-btn composer-media" aria-label="Prendre une photo"><IconCamera />
            <input type="file" accept="image/*" capture="environment" hidden onChange={pickFile} /></label>
          <label className="icon-btn composer-media" aria-label="Choisir une photo"><IconImage />
            <input type="file" accept="image/*" hidden onChange={pickFile} /></label>
        </>}
        <textarea ref={input} rows={1} placeholder="Message…" value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !('ontouchstart' in window)) { e.preventDefault(); send() } }} />
        <button className="send" onPointerDown={(e) => e.preventDefault()} onMouseDown={(e) => e.preventDefault()} onClick={send} disabled={!text.trim()} aria-label="Envoyer"><IconSend /></button>
      </div>
    </div>
  )
}

/** Message en cours d'envoi : affiché tout de suite comme les autres (fondu doux). L'état « en attente de réseau »
 *  n'apparaît que hors ligne ou si l'envoi traîne plus de 2 secondes ; en cas d'échec, Réessayer / Supprimer. */
function PendingLine({ p, replyName }: { p: Pending; replyName: (uid: string | null) => string }) {
  const [slow, setSlow] = useState(() => !navigator.onLine || Date.now() - Date.parse(p.created_at) > 2000)
  useEffect(() => {
    if (slow) return
    const t = setTimeout(() => setSlow(true), Math.max(0, 2000 - (Date.now() - Date.parse(p.created_at))))
    return () => clearTimeout(t)
  }, [slow, p.created_at])
  return (
    <div className={`line new${p.failed ? ' failed' : slow ? ' slow' : ''}`}>
      {p.reply && <Quote r={p.reply} name={replyName(p.reply.a)} />}
      {p.photo && <Photo photo={p.photo} />}
      {/* même mise en page que le message envoyé (heure + coche grisée) : rien ne bouge quand il arrive */}
      {p.content && <div className="bubble-text">{p.content}<span className="msg-meta">{hhmm(new Date(p.created_at))}<span className="tick wait" aria-label="Envoi…">✓</span></span></div>}
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
