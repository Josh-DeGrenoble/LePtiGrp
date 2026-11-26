import { useState } from 'react'
import { DatePicker } from './DatePicker'
import { REPEATS } from '../lib/tools'
import type { Repeat } from '../lib/supabase'

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Récurrence d'un événement : une fois, chaque jour / semaine / mois / année, avec une date de fin facultative */
export function RepeatPicker({ repeat, until, onChange }: {
  repeat: Repeat | null; until: string | null; onChange: (r: { repeat: Repeat | null; until: string | null }) => void
}) {
  const [pickEnd, setPickEnd] = useState(!!until)
  return (
    <div className="repeat-picker">
      <div className="chip-filter repeat-chips">
        <button type="button" className={`pref-chip${!repeat ? ' on' : ''}`} onClick={() => { onChange({ repeat: null, until: null }); setPickEnd(false) }}>Une fois</button>
        {REPEATS.map(([k, label]) => (
          <button type="button" key={k} className={`pref-chip${repeat === k ? ' on' : ''}`} onClick={() => onChange({ repeat: k, until })}>{label}</button>
        ))}
      </div>
      {repeat && <div className="repeat-end">
        <div className="tp-row">
          <span className="muted">Fin</span>
          <button type="button" className={`pref-chip${!pickEnd ? ' on' : ''}`} onClick={() => { setPickEnd(false); onChange({ repeat, until: null }) }}>Jamais</button>
          <button type="button" className={`pref-chip${pickEnd ? ' on' : ''}`} onClick={() => setPickEnd(true)}>
            {until ? `Jusqu'au ${new Date(`${until}T12:00:00`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}` : 'Jusqu’au…'}
          </button>
        </div>
        {pickEnd && <DatePicker value={until ? [new Date(`${until}T00:00:00`)] : []} onChange={(d) => onChange({ repeat, until: d[0] ? ymd(d[0]) : null })} max={1} single />}
      </div>}
    </div>
  )
}
