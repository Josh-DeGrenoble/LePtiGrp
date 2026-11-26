import { useEffect, useState } from 'react'
import { Sheet } from './Sheet'
import { LimitedInput } from './LimitedInput'
import { IconClose } from './Icons'
import { notify } from './Dialog'
import { supabase, errMsg, type Reminder } from '../lib/supabase'
import { enablePush, pushState } from '../lib/push'

const UNITS = [{ label: 'min', ms: 60e3 }, { label: 'heures', ms: 3600e3 }, { label: 'jours', ms: 86400e3 }]
const QUICK = [{ label: '10 min', n: 10, u: 0 }, { label: '30 min', n: 30, u: 0 }, { label: '1 h', n: 1, u: 1 }, { label: '3 h', n: 3, u: 1 }, { label: '1 jour', n: 1, u: 2 }]
const when = (d: Date) => d.toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/** Pop-up « Notification » : programmer un rappel pour soi, reçu en notification à l'heure choisie */
export function ReminderSheet({ open, onClose, convId }: { open: boolean; onClose: () => void; convId?: string }) {
  const [message, setMessage] = useState('')
  const [mode, setMode] = useState<'in' | 'at'>('in')
  const [n, setN] = useState('30')
  const [unit, setUnit] = useState(0)
  const [at, setAt] = useState('')
  const [upcoming, setUpcoming] = useState<Reminder[]>([])
  const [pushOn, setPushOn] = useState(true)

  const load = () => supabase.from('reminders').select('*').is('sent_at', null).order('remind_at')
    .then(({ data }) => setUpcoming((data as Reminder[]) ?? []))
  useEffect(() => {
    if (!open) return
    load()
    pushState().then((s) => setPushOn(s === 'on'))
  }, [open])

  const date = mode === 'in' ? (Number(n) > 0 ? new Date(Date.now() + Number(n) * UNITS[unit].ms) : null) : at ? new Date(at) : null
  const valid = !!message.trim() && !!date && date.getTime() > Date.now()

  const save = async () => {
    if (!valid) return
    const { error } = await supabase.from('reminders').insert({ message: message.trim(), remind_at: date!.toISOString(), conversation_id: convId ?? null })
    if (error) return notify(errMsg(error))
    setMessage(''); load()
  }
  const cancel = async (id: number) => {
    setUpcoming((r) => r.filter((x) => x.id !== id))
    await supabase.from('reminders').delete().eq('id', id)
  }
  const activate = async () => {
    try { await enablePush(); setPushOn(true) } catch (e) { notify(errMsg(e) === 'denied' ? 'Les notifications sont bloquées dans les réglages du téléphone.' : errMsg(e)) }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Notification">
      {!pushOn && <div className="reminder-warn">Les notifications sont désactivées sur ce téléphone. <button onClick={activate}>Activer</button></div>}
      <LimitedInput max={200} placeholder="Message du rappel" value={message} onChange={(e) => setMessage(e.target.value)} />
      <div className="segmented reminder-mode">
        <button className={mode === 'in' ? 'on' : ''} onClick={() => setMode('in')}>Dans…</button>
        <button className={mode === 'at' ? 'on' : ''} onClick={() => setMode('at')}>Le…</button>
      </div>
      {mode === 'in' ? <>
        <div className="reminder-in">
          <input type="number" inputMode="numeric" min={1} value={n} onChange={(e) => setN(e.target.value)} aria-label="Durée" />
          <div className="segmented">
            {UNITS.map((u, i) => <button key={u.label} className={unit === i ? 'on' : ''} onClick={() => setUnit(i)}>{u.label}</button>)}
          </div>
        </div>
        <div className="chip-row">
          {QUICK.map((q) => (
            <button key={q.label} className={`chip quick${Number(n) === q.n && unit === q.u ? ' on' : ''}`} onClick={() => { setN(String(q.n)); setUnit(q.u) }}>{q.label}</button>
          ))}
        </div>
      </> : <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} aria-label="Date et heure" />}
      <p className="reminder-when">{date && date.getTime() > Date.now() ? `Notification le ${when(date)}` : 'Choisis un moment à venir'}</p>
      <button className="btn primary wide" disabled={!valid} onClick={save}>Programmer</button>

      {upcoming.length > 0 && <>
        <div className="sheet-section">À venir</div>
        {upcoming.map((r) => (
          <div key={r.id} className="reminder-row">
            <div><div className="reminder-msg">{r.message}</div><small>{when(new Date(r.remind_at))}</small></div>
            <button className="icon-btn" onClick={() => cancel(r.id)} aria-label="Annuler le rappel"><IconClose /></button>
          </div>
        ))}
      </>}
    </Sheet>
  )
}
