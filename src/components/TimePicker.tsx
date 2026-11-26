import { useRef, useState } from 'react'

const clean = (s: string) => s.replace(/\D/g, '').slice(0, 2)

/**
 * Heure facultative (« HH:MM » ou '') tapée au clavier : deux petits champs heures et minutes.
 * (Le sélecteur natif d'Android a ses boutons coupés quand la police du téléphone est grande.)
 */
export function TimePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [hh, setHh] = useState(() => value.slice(0, 2))
  const [mm, setMm] = useState(() => value.slice(3, 5))
  const min = useRef<HTMLInputElement>(null)

  const emit = (h: string, m: string) => {
    const H = Number(h), M = Number(m || 0)
    onChange(h !== '' && H <= 23 && M <= 59 ? `${String(H).padStart(2, '0')}:${String(M).padStart(2, '0')}` : '')
  }
  const bad = (hh !== '' && Number(hh) > 23) || (mm !== '' && Number(mm) > 59)

  return (
    <div className="timepicker">
      <span className="muted">Heure (facultatif)</span>
      <div className={`tp-fields${bad ? ' bad' : ''}`}>
        <input inputMode="numeric" placeholder="HH" value={hh} aria-label="Heures"
          onChange={(e) => { const h = clean(e.target.value); setHh(h); emit(h, mm); if (h.length === 2) min.current?.focus() }} />
        <b>:</b>
        <input ref={min} inputMode="numeric" placeholder="MM" value={mm} aria-label="Minutes"
          onChange={(e) => { const m = clean(e.target.value); setMm(m); emit(hh, m) }} />
      </div>
    </div>
  )
}
