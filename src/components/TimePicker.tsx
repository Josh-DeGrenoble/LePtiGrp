import { useState } from 'react'

const HOURS = Array.from({ length: 24 }, (_, i) => i)
const MINUTES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]
const pad = (n: number) => String(n).padStart(2, '0')

/**
 * Choix d'une heure facultative (« HH:MM » ou '') sans le sélecteur natif d'Android,
 * dont les boutons sont coupés quand la police du téléphone est grande.
 */
export function TimePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const [h, m] = value ? value.split(':').map(Number) : [null, null]
  const label = value ? `${h}h${m ? pad(m) : ''}` : "Pas d'heure"
  const setHour = (x: number) => onChange(`${pad(x)}:${pad(m ?? 0)}`)
  const setMin = (x: number) => onChange(`${pad(h ?? 20)}:${pad(x)}`)

  return (
    <div className="timepicker">
      <div className="tp-row">
        <span className="muted">Heure</span>
        <button type="button" className={`tp-value${value ? ' on' : ''}`} onClick={() => setOpen(!open)}>{label}</button>
        {value && <button type="button" className="link-btn" onClick={() => { onChange(''); setOpen(false) }}>Retirer</button>}
      </div>
      {open && <div className="tp-panel fade-in">
        <div className="tp-grid">
          {HOURS.map((x) => <button type="button" key={x} className={x === h ? 'on' : ''} onClick={() => setHour(x)}>{x}h</button>)}
        </div>
        <div className="tp-grid">
          {MINUTES.map((x) => <button type="button" key={x} className={value && x === m ? 'on' : ''} onClick={() => setMin(x)}>:{pad(x)}</button>)}
        </div>
        <button type="button" className="btn primary wide" onClick={() => setOpen(false)}>OK</button>
      </div>}
    </div>
  )
}
