import { useState } from 'react'
import { IconBack } from './Icons'

const DAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const key = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate())

/** Libellé d'une date pour une option de sondage, ex. « Sam. 29 nov. » */
export const dateLabel = (d: Date) => {
  const s = d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })
  return s.charAt(0).toUpperCase() + s.slice(1)
}

/**
 * Calendrier pour choisir des dates : jours un par un, ou plage (du… au…).
 * `value` est trié du plus tôt au plus tard ; `max` limite le nombre de jours.
 */
export function DatePicker({ value, onChange, max }: { value: Date[]; onChange: (d: Date[]) => void; max: number }) {
  const today = startOfDay(new Date())
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))
  const [range, setRange] = useState(false)
  const [start, setStart] = useState<Date | null>(null)  // 1er jour de plage en attente du 2e
  const picked = new Set(value.map(key))

  const tap = (d: Date) => {
    if (!range) {
      const next = picked.has(key(d)) ? value.filter((x) => key(x) !== key(d)) : [...value, d]
      return onChange(next.sort((a, b) => +a - +b).slice(0, max))
    }
    if (!start) { setStart(d); return onChange([d]) }
    const [a, b] = d < start ? [d, start] : [start, d]
    const days: Date[] = []
    for (let x = new Date(a); x <= b && days.length < max; x.setDate(x.getDate() + 1)) days.push(new Date(x))
    setStart(null); onChange(days)
  }

  // grille du mois, semaines commençant le lundi
  const first = (month.getDay() + 6) % 7
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  const cells = [...Array(first).fill(null), ...Array.from({ length: count }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1))]
  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1))

  return (
    <div className="datepicker">
      <div className="segmented share-modes">
        <button className={!range ? 'on' : ''} onClick={() => { setRange(false); setStart(null) }}>Jours choisis</button>
        <button className={range ? 'on' : ''} onClick={() => { setRange(true); setStart(null); onChange([]) }}>Plage</button>
      </div>
      <div className="dp-head">
        <button className="icon-btn" onClick={() => shift(-1)} disabled={month <= new Date(today.getFullYear(), today.getMonth(), 1)} aria-label="Mois précédent"><IconBack size={20} /></button>
        <b>{month.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}</b>
        <button className="icon-btn dp-next" onClick={() => shift(1)} aria-label="Mois suivant"><IconBack size={20} /></button>
      </div>
      <div className="dp-grid">
        {DAYS.map((d, i) => <span key={i} className="dp-dow">{d}</span>)}
        {cells.map((d, i) => d
          ? <button key={i} className={`dp-day${picked.has(key(d)) ? ' on' : ''}${+d === +today ? ' today' : ''}`} disabled={d < today} onClick={() => tap(d)}>{d.getDate()}</button>
          : <span key={i} />)}
      </div>
      <p className="muted small share-hint">
        {range ? (start ? 'Touche le dernier jour de la plage.' : 'Touche le premier jour de la plage.') : 'Touche les jours à proposer.'}
        {value.length > 0 && ` ${value.length} jour${value.length > 1 ? 's' : ''} sélectionné${value.length > 1 ? 's' : ''}${value.length >= max ? ` (max ${max})` : ''}.`}
      </p>
    </div>
  )
}
