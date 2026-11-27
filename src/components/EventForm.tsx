import { useState } from 'react'
import { LimitedInput } from './LimitedInput'
import { DatePicker } from './DatePicker'
import { IconBack, IconCalendar } from './Icons'
import { REPEATS } from '../lib/tools'
import type { Repeat } from '../lib/supabase'

export type EventFields = { title: string; day: Date | null; time: string; place: string; repeat: Repeat | null; until: string | null }

const DOW = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
const monday = (d: Date) => { const x = startOfDay(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x }
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const same = (a: Date | null, b: Date) => !!a && +startOfDay(a) === +b

/**
 * Formulaire d'un événement : nom, semaine sur une ligne (flèches, ou calendrier complet),
 * heure (champ natif, comme dans les comptes), récurrence en liste déroulante, lieu.
 */
export function EventForm({ value, onChange, autoFocus }: { value: EventFields; onChange: (v: EventFields) => void; autoFocus?: boolean }) {
  const today = startOfDay(new Date())
  const [week, setWeek] = useState(() => monday(value.day ?? today))
  const [full, setFull] = useState(false)
  const [reset, setReset] = useState(0)  // « Aujourd'hui » ramène aussi le grand calendrier au mois en cours
  const set = (p: Partial<EventFields>) => onChange({ ...value, ...p })
  const days = Array.from({ length: 7 }, (_, i) => new Date(week.getFullYear(), week.getMonth(), week.getDate() + i))
  const shift = (n: number) => setWeek(new Date(week.getFullYear(), week.getMonth(), week.getDate() + 7 * n))
  const pick = (d: Date) => { set({ day: d }); setWeek(monday(d)) }
  const month = days[3].toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })

  return (
    <div className="event-form">
      <LimitedInput placeholder="Nom de l'événement" value={value.title} max={100} onChange={(e) => set({ title: e.target.value })} autoFocus={autoFocus} />

      <div className="week-head">
        {full ? <b className="plain">Choisis le jour</b> : <b>{month}</b>}
        {(full || +week !== +monday(today)) && <button type="button" className="link-btn week-today" onClick={() => { setWeek(monday(today)); setReset((n) => n + 1) }}>Aujourd'hui</button>}
        <button type="button" className={`link-btn week-expand${full ? ' on' : ''}`} onClick={() => setFull(!full)}>
          <IconCalendar size={16} /> {full ? 'Semaine' : 'Mois'}
        </button>
      </div>
      {full
        ? <DatePicker key={reset} value={value.day ? [value.day] : []} onChange={(d) => { if (d[0]) { pick(d[0]); setFull(false) } }} max={1} single />
        : <div className="week-strip">
            <button type="button" className="icon-btn" onClick={() => shift(-1)} disabled={+week <= +monday(today)} aria-label="Semaine précédente"><IconBack size={18} /></button>
            {days.map((d, i) => (
              <button type="button" key={i} disabled={d < today}
                className={`week-day${same(value.day, d) ? ' on' : ''}${+d === +today ? ' today' : ''}`} onClick={() => pick(d)}>
                <small>{DOW[i]}</small><b>{d.getDate()}</b>
              </button>
            ))}
            <button type="button" className="icon-btn dp-next" onClick={() => shift(1)} aria-label="Semaine suivante"><IconBack size={18} /></button>
          </div>}

      <div className="inline-form event-when">
        <input type="time" value={value.time} onChange={(e) => set({ time: e.target.value })} aria-label="Heure (facultatif)" />
        <select className="repeat-select" value={value.repeat ?? ''} aria-label="Récurrence"
          onChange={(e) => set({ repeat: (e.target.value || null) as Repeat | null, ...(!e.target.value && { until: null }) })}>
          <option value="">Une fois</option>
          {REPEATS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
        </select>
      </div>
      {value.repeat && <label className="inline-form event-until">
        <span className="muted small">Jusqu'au (facultatif)</span>
        <input type="date" value={value.until ?? ''} min={value.day ? ymd(value.day) : undefined} onChange={(e) => set({ until: e.target.value || null })} />
      </label>}
      <LimitedInput placeholder="Lieu (facultatif)" value={value.place} max={100} onChange={(e) => set({ place: e.target.value })} />
    </div>
  )
}
