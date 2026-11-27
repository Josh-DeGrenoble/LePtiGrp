import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Screen } from '../components/Layout'
import { BackButton } from '../components/BackButton'
import { HeaderMenu } from '../components/HeaderMenu'
import { PollCard } from '../components/PollCard'
import { LimitedInput } from '../components/LimitedInput'
import { Sheet, SheetButton, Toggle } from '../components/Sheet'
import { DatePicker } from '../components/DatePicker'
import { ask, notify } from '../components/Dialog'
import { IconCalendar, IconClose, IconLock, IconPencil, IconPlus, IconTrash } from '../components/Icons'
import { supabase, errMsg, type Poll, type Vote } from '../lib/supabase'
import { OfflineLocked } from '../components/OfflineLocked'
import { isShared } from '../lib/tools'
import { readCache, useOnline } from '../lib/network'

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const MONTHS = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc']
/** Date d'une réponse de sondage de dates (anciens sondages : on relit « Sam. 29 nov. », année la plus proche) */
function optionDate(p: Poll, i: number): string | null {
  if (p.dates?.[i]) return p.dates[i]
  const m = p.options[i].toLowerCase().match(/(\d{1,2})\s+([a-zéû]+)/)
  const mo = m ? MONTHS.findIndex((x) => m[2].startsWith(x.slice(0, 3))) : -1
  if (!m || mo < 0) return null
  const now = new Date(), d = new Date(now.getFullYear(), mo, Number(m[1]))
  if (+d < +now - 180 * 864e5) d.setFullYear(d.getFullYear() + 1)
  return ymd(d)
}

type Opt = { from: number | null; text: string; voted: boolean }

export default function PollPage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const backTo = (useLocation().state as { from?: string } | null)?.from ?? '/polls'
  const [poll, setPoll] = useState<Poll | null>(() => readCache<Poll | null>(`poll:${id}`, null))
  const [votes, setVotes] = useState<Vote[]>([])
  const [missing, setMissing] = useState(false)
  const online = useOnline()
  const [version, setVersion] = useState(0)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<{ q: string; opts: Opt[]; multi: boolean }>({ q: '', opts: [], multi: false })
  const [planning, setPlanning] = useState(false)
  const [planDay, setPlanDay] = useState<Date[]>([])
  const [planTime, setPlanTime] = useState('20:00')
  const [making, setMaking] = useState(false)

  const load = () => {
    supabase.from('polls').select('*').eq('id', id).maybeSingle().then(({ data }) => {
      if (data) setPoll(data)
      else if (navigator.onLine) setMissing(true)
    })
    supabase.from('poll_votes').select('*').eq('poll_id', id).then(({ data }) => setVotes(data ?? []))
  }
  useEffect(() => {
    load()
    const ch = supabase.channel(`pollpage-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'poll_votes', filter: `poll_id=eq.${id}` }, load)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps
  const refresh = () => { load(); setVersion((v) => v + 1) }

  const closed = !!poll?.closes_at && Date.parse(poll.closes_at) <= Date.now()
  const isDates = !!poll && (!!poll.dates || poll.options.every((_, i) => optionDate(poll, i)))
  const count = (i: number) => votes.filter((v) => v.option === i).length

  const startEdit = () => {
    if (!poll) return
    setForm({ q: poll.question, multi: poll.multiple, opts: poll.options.map((text, i) => ({ from: i, text, voted: count(i) > 0 })) })
    setEditing(true)
  }
  const save = async () => {
    const opts = form.opts.filter((o) => o.text.trim()).map((o) => ({ from: o.from, text: o.text.trim() }))
    if (opts.length < 2) return notify('Il faut au moins 2 réponses.')
    const { error } = await supabase.rpc('edit_poll', { p: id, q: form.q, opts, multi: form.multi, closes: poll?.closes_at ?? null })
    if (error) return notify(errMsg(error))
    setEditing(false); refresh()
  }
  const close = async (at: string | null) => {
    const { error } = await supabase.rpc('close_poll', { p: id, at_: at })
    if (error) return notify(errMsg(error))
    setPlanning(false); refresh()
  }
  const destroy = async () => {
    if (!(await ask('Supprimer ce sondage et tous ses votes ?'))) return
    const { error } = await supabase.from('polls').delete().eq('id', id)
    if (error) return notify(errMsg(error))
    nav(backTo, { replace: true })
  }
  // créer l'événement : la date choisie, liée à la conv du sondage
  const makeEvent = (i: number) => {
    const day = optionDate(poll!, i)
    if (!day) return
    const q = new URLSearchParams({ day, q: poll!.question.replace(/\s*\?$/, '') })
    if (poll!.conversation_id) q.set('conv', poll!.conversation_id)
    nav(`/calendar/new?${q}`, { state: { from: `/polls/${id}` } })
  }
  const ranked = poll ? poll.options.map((o, i) => ({ o, i, n: count(i) })).sort((a, b) => b.n - a.n) : []

  return (
    <Screen header={<><BackButton to={backTo} /><h1>Sondage</h1><HeaderMenu convId={poll?.conversation_id ?? undefined} /></>}>
      {missing ? <p className="empty">Ce sondage n'existe plus ou tu n'y as plus accès.</p> : !online && poll && isShared(poll) ? <OfflineLocked /> : <>
        <div className="card"><PollCard pollId={id} version={version} /></div>
        {poll && <div className="list-card">
          {closed && isDates && <button className="settings-row" onClick={() => setMaking(true)}><IconCalendar size={20} /><span>Créer l'événement dans le calendrier</span></button>}
          {!closed && <button className="settings-row" onClick={startEdit}><IconPencil size={18} /><span>Modifier le sondage</span></button>}
          {closed
            ? <button className="settings-row" onClick={() => close(null)}><IconLock size={18} /><span>Rouvrir les votes</span></button>
            : <>
              <button className="settings-row" onClick={async () => (await ask('Clôturer les votes maintenant ?')) && close(new Date().toISOString())}><IconLock size={18} /><span>Clôturer maintenant</span></button>
              <button className="settings-row" onClick={() => { setPlanDay(poll.closes_at ? [new Date(poll.closes_at)] : []); setPlanning(true) }}>
                <IconCalendar size={18} /><span>{poll.closes_at ? 'Changer la date de clôture' : 'Programmer la clôture'}</span></button>
            </>}
        </div>}
        {poll?.conversation_id && <button className="btn wide" onClick={() => nav(`/c/${poll.conversation_id}`)}>Voir dans la conversation</button>}
        {poll && <button className="settings-row danger note-delete" onClick={destroy}><IconTrash /><span>Supprimer le sondage</span></button>}
      </>}

      <Sheet open={editing} onClose={() => setEditing(false)} title="Modifier le sondage" form>
        <LimitedInput max={200} value={form.q} onChange={(e) => setForm({ ...form, q: e.target.value })} aria-label="Question" />
        <div className="poll-options-edit">
          {form.opts.map((o, i) => (
            <div key={i} className="inline-form">
              <LimitedInput max={80} value={o.text} disabled={o.voted} placeholder={`Réponse ${i + 1}`}
                onChange={(e) => setForm({ ...form, opts: form.opts.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)) })} />
              {o.voted ? <span className="icon-btn muted" title="Déjà votée"><IconLock size={16} /></span>
                : <button className="icon-btn" onClick={() => setForm({ ...form, opts: form.opts.filter((_, j) => j !== i) })} aria-label="Retirer"><IconClose /></button>}
            </div>
          ))}
          {form.opts.length < 31 && !poll?.dates && <button className="link-btn add-option" onClick={() => setForm({ ...form, opts: [...form.opts, { from: null, text: '', voted: false }] })}><IconPlus size={16} /> Ajouter une réponse</button>}
        </div>
        <p className="muted small">🔒 Les réponses qui ont déjà des votes ne peuvent pas changer.</p>
        <Toggle label="Plusieurs réponses possibles" checked={form.multi} onChange={(multi) => setForm({ ...form, multi })} />
        <button className="btn primary wide" disabled={!form.q.trim()} onClick={save}>Enregistrer</button>
      </Sheet>

      <Sheet open={planning} onClose={() => setPlanning(false)} title="Clôture des votes">
        <DatePicker value={planDay} onChange={setPlanDay} max={1} single />
        <input type="time" value={planTime} onChange={(e) => setPlanTime(e.target.value)} aria-label="Heure" />
        <button className="btn primary wide" disabled={planDay.length !== 1 || !planTime}
          onClick={() => { const [h, m] = planTime.split(':').map(Number); const d = new Date(planDay[0]); d.setHours(h, m, 0, 0); close(d.toISOString()) }}>Programmer</button>
        {poll?.closes_at && <SheetButton danger onClick={() => close(null)}>Retirer la clôture programmée</SheetButton>}
      </Sheet>

      <Sheet open={making} onClose={() => setMaking(false)} title="Quelle date ?">
        <p className="muted small">L'événement sera créé{poll?.conversation_id ? ' et lié à la conversation' : ''}. La plus votée est en haut.</p>
        {ranked.map(({ o, i, n }) => <SheetButton key={i} onClick={() => makeEvent(i)}>{o} · {n} vote{n > 1 ? 's' : ''}</SheetButton>)}
      </Sheet>
    </Screen>
  )
}
