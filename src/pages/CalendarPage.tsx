import { useEffect, useState } from 'react'
import { Link, useLocation, useMatch, useNavigate, useSearchParams } from 'react-router-dom'
import { Screen } from '../components/Layout'
import { BackButton } from '../components/BackButton'
import { HeaderMenu } from '../components/HeaderMenu'
import { IconBack, IconPlus, IconUser, IconUsers, IconUserPlus, IconCalendar } from '../components/Icons'
import { Sheet } from '../components/Sheet'
import { ShareChooser } from '../components/ShareChooser'
import { EventForm, type EventFields } from '../components/EventForm'
import { notify } from '../components/Dialog'
import { errMsg } from '../lib/supabase'
import { supabase, type CalEvent, type ConvSummary } from '../lib/supabase'
import { readCache, useOnResume, useOnline, writeCache } from '../lib/network'
import { flushWrites } from '../lib/offlineDb'
import { useMe } from '../lib/auth'
import { cachedConversations, fetchConversations } from '../lib/myConversations'
import { createTool, nextOccurrence, occursOn, type Share } from '../lib/tools'
import { EmptyState } from '../components/EmptyState'

type Row = CalEvent & { event_replies: { user_id: string; going: boolean }[] }
const DOW = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const hour = (t: string | null) => (t ? t.slice(0, 5).replace(':', 'h').replace(/h00$/, 'h') : '')

/** Calendrier : tous mes événements (perso, de mes convs, proposés par des amis), d'où que je l'ouvre */
export default function CalendarPage() {
  const me = useMe()
  const nav = useNavigate()
  const st = useLocation().state as { from?: string; root?: string } | null
  const [events, setEvents] = useState<Row[]>(() => readCache<Row[]>('calendar', []))
  const [convs, setConvs] = useState<ConvSummary[]>(cachedConversations)
  const today = ymd(new Date())
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1) })
  const [picked, setPicked] = useState<string | null>(null)
  const [past, setPast] = useState(false)
  const [monthOnly, setMonthOnly] = useState(false)
  // création (pop-up) : ouverte par le +, ou par /calendar/new?day&q&conv (depuis un sondage de dates)
  const isNew = !!useMatch('/calendar/new')
  const [params] = useSearchParams()
  const [form, setForm] = useState<EventFields | null>(null)
  const [share, setShare] = useState<Share>({ mode: 'me', conv: null, ids: [] })
  const [busy, setBusy] = useState(false)
  const startNew = (day: string | null, q = '', conv: string | null = null) => {
    setForm({ title: q, day: day ? new Date(`${day}T00:00:00`) : null, time: '', place: '', repeat: null, until: null })
    setShare({ mode: conv ? 'conv' : 'me', conv, ids: [] })
  }
  useEffect(() => { if (isNew) startNew(params.get('day') ?? today, params.get('q') ?? '', params.get('conv')) }, [isNew]) // eslint-disable-line react-hooks/exhaustive-deps
  const closeNew = () => { setForm(null); if (isNew) nav('/calendar', { replace: true, state: st }) }
  const create = async () => {
    if (!form?.day) return
    setBusy(true)
    try {
      const item = await createTool('calendar', {
        title: form.title.trim(), day: ymd(form.day), at_time: form.time || null, place: form.place.trim() || null,
        repeat: form.repeat, repeat_until: form.repeat ? form.until : null,
      }, share, me)
      setForm(null)
      nav(`/calendar/${item.id}`, { replace: isNew, state: { from: '/calendar', root: st?.root } })
    } catch (e) { notify(errMsg(e)) } finally { setBusy(false) }
  }

  const load = async () => {
    await flushWrites()
    supabase.from('events').select('*, event_replies(user_id, going)').order('day').order('at_time', { nullsFirst: true })
      .then(({ data }) => {
        if (!data) return
        const rows = (data as Row[]).sort((x, y) => x.day.localeCompare(y.day) || (x.at_time ?? '').localeCompare(y.at_time ?? ''))
        setEvents(rows); writeCache('calendar', rows)
      })
    fetchConversations().then((d) => { if (d) setConvs(d) })
  }
  useEffect(() => { load() }, [])
  useOnResume(load)

  const convName = new Map(convs.map((c) => [c.id, c.name ?? 'Discussion']))
  // à qui s'adresse l'événement : une conv, des amis choisis, ou moi seul
  const scope = (e: Row) => e.conversation_id ? 'conv' : e.participants.length > 1 ? 'friends' : 'solo'
  const Scope = ({ e }: { e: Row }) => {
    const k = scope(e)
    return <span className={`event-scope ${k}`}>
      {k === 'conv' ? <IconUsers size={13} /> : k === 'friends' ? <IconUserPlus size={13} /> : <IconUser size={13} />}
      {k === 'conv' ? convName.get(e.conversation_id!) ?? 'Conversation' : k === 'friends' ? `${e.participants.length - 1} ami${e.participants.length > 2 ? 's' : ''}` : 'Perso'}
    </span>
  }

  // grille du mois (semaines du lundi au dimanche)
  const first = (month.getDay() + 6) % 7
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const cells = [...Array(first).fill(null), ...Array.from({ length: count }, (_, i) => ymd(new Date(month.getFullYear(), month.getMonth(), i + 1)))]
  const shift = (n: number) => { setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1)); setPicked(null) }
  const now = new Date()
  const atToday = month.getFullYear() === now.getFullYear() && month.getMonth() === now.getMonth() && !picked
  const goToday = () => { setMonth(new Date(now.getFullYear(), now.getMonth(), 1)); setPicked(null) }
  // événements de chaque jour du mois affiché (récurrences comprises)
  const byDay = new Map<string, Row[]>()
  for (const d of cells) if (d) { const l = events.filter((e) => occursOn(e, d)); if (l.length) byDay.set(d, l) }

  // chaque ligne = un événement à une date (la prochaine fois pour un événement récurrent)
  type Occ = { e: Row; on: string }
  const inMonth = (on: boolean) => cells.filter((d): d is string => !!d && (on ? d < today : d >= today))
    .flatMap((d) => (byDay.get(d) ?? []).map((e) => ({ e, on: d })))
  const occs: Occ[] = picked ? events.filter((e) => occursOn(e, picked)).map((e) => ({ e, on: picked }))
    : monthOnly ? (past ? inMonth(true).reverse() : inMonth(false))
    : past ? events.filter((e) => e.day < today && (!e.repeat || !nextOccurrence(e, today)))
        .map((e) => ({ e, on: e.repeat ? e.repeat_until ?? e.day : e.day })).sort((a, b) => b.on.localeCompare(a.on))
    : events.map((e) => ({ e, on: nextOccurrence(e, today) })).filter((o): o is Occ => !!o.on)
        .sort((a, b) => a.on.localeCompare(b.on) || (a.e.at_time ?? '').localeCompare(b.e.at_time ?? ''))
  const list = occs
  const groups = new Map<string, Occ[]>()
  for (const o of list) {
    const k = new Date(`${o.on}T12:00:00`).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })
    groups.set(k, [...(groups.get(k) ?? []), o])
  }
  const online = useOnline()
  const open = (e: Row) => !online && scope(e) !== 'solo' ? notify('Pas de réseau : il faut être connecté pour ouvrir un événement partagé.') : nav(`/calendar/${e.id}`, { state: { from: '/calendar', root: st?.root } })

  return (
    <Screen header={<><BackButton to={st?.from ?? '/'} /><h1>Calendrier</h1><HeaderMenu /></>}>
      <div className="card cal-month">
        <div className="dp-head">
          <button className="icon-btn" onClick={() => shift(-1)} aria-label="Mois précédent"><IconBack size={20} /></button>
          <b>{month.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</b>
          <button className={`cal-today${atToday ? ' off' : ''}`} onClick={goToday} disabled={atToday}>Aujourd'hui</button>
          <button className="icon-btn dp-next" onClick={() => shift(1)} aria-label="Mois suivant"><IconBack size={20} /></button>
        </div>
        <div className="dp-grid">
          {DOW.map((d, i) => <span key={i} className="dp-dow">{d}</span>)}
          {cells.map((d, i) => d
            ? <button key={i} className={`dp-day cal-day${d === picked ? ' on' : ''}${d === today ? ' today' : ''}${d < today ? ' past' : ''}`}
                onClick={() => setPicked(d === picked ? null : d)}>
                {Number(d.slice(8))}
                {byDay.has(d) && <span className="cal-dots">{byDay.get(d)!.slice(0, 3).map((e) => <i key={e.id} className={scope(e)} />)}</span>}
              </button>
            : <span key={i} />)}
        </div>
      </div>

      {!picked && <div className="cal-filters">
        <div className="segmented share-modes">
          <button className={!past ? 'on' : ''} onClick={() => setPast(false)}>À venir</button>
          <button className={past ? 'on' : ''} onClick={() => setPast(true)}>Passés</button>
        </div>
        <button className={`pref-chip cal-month-only${monthOnly ? ' on' : ''}`} onClick={() => setMonthOnly(!monthOnly)} aria-pressed={monthOnly}>
          {month.toLocaleDateString('fr-FR', { month: 'short' })}
        </button>
      </div>}
      {picked && <div className="section-title cal-picked">
        {new Date(`${picked}T12:00:00`).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
        <button className="link-btn" onClick={() => setPicked(null)}>Tout voir</button>
      </div>}

      {list.length === 0 && (picked || past ? <p className="empty">{picked ? 'Rien ce jour-là.' : 'Aucun événement passé.'}</p>
        : <EmptyState icon={<IconCalendar size={34} />} title="Aucun événement à venir" text="Propose une sortie, un repas, un anniversaire…"
          action={<Link to="/calendar/new" className="btn primary with-icon"><IconPlus size={18} /> Proposer un événement</Link>} />)}
      {[...groups.entries()].map(([title, rows]) => (
        <div key={title} className="fade-in">
          {!picked && <div className="section-title cap">{title}</div>}
          <div className="list-card">
            {rows.map(({ e, on }) => {
              const mine = e.event_replies.find((r) => r.user_id === me)
              const yes = e.event_replies.filter((r) => r.going).length
              const d = new Date(`${on}T12:00:00`)
              return (
                <button key={e.id + on} className={`settings-row event-row${!online && scope(e) !== 'solo' ? ' offline-dim' : ''}`} onClick={() => open(e)}>
                  <span className="event-date"><b>{d.getDate()}</b><small>{d.toLocaleDateString('fr-FR', { weekday: 'short' })}</small></span>
                  <span className="event-main">
                    <span className="note-name">{e.title}</span>
                    <small className="muted"><Scope e={e} />{[e.repeat ? '🔁' : '', hour(e.at_time), e.place].filter(Boolean).join(' · ')}{yes ? ` · ${yes} ✓` : ''}</small>
                  </span>
                  {e.participants.length > 1 || e.conversation_id
                    ? <span className={`event-me ${mine ? (mine.going ? 'yes' : 'no') : 'wait'}`}>{mine ? (mine.going ? '✓' : '✗') : '?'}</span>
                    : null}
                </button>
              )
            })}
          </div>
        </div>
      ))}
      <button className="fab" onClick={() => startNew(picked ?? today)} aria-label="Nouvel événement"><IconPlus size={32} /></button>

      <Sheet open={!!form} onClose={closeNew} title="Nouvel événement" form autoFocus>
        {form && <>
          <EventForm value={form} onChange={setForm} />
          <div className="section-title">Partagé avec</div>
          <ShareChooser value={share} onChange={setShare} />
          <button className="btn primary wide event-create" disabled={busy || !form.title.trim() || !form.day || (share.mode === 'conv' && !share.conv)} onClick={create}>Créer</button>
        </>}
      </Sheet>
    </Screen>
  )
}
