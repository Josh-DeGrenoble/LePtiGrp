import { useState, type InputHTMLAttributes, type Ref } from 'react'

/**
 * Champ texte avec longueur max fiable : le texte est coupé à chaque frappe
 * (le maxLength natif laisse iOS/claviers prédictifs continuer à "écrire" sans l'afficher),
 * et le champ tremble en rouge quand on essaie de dépasser.
 */
export function LimitedInput({ max, value, defaultValue, onChange, className = '', ...rest }:
  Omit<InputHTMLAttributes<HTMLInputElement>, 'maxLength'> & { max: number; ref?: Ref<HTMLInputElement> }) {
  const [inner, setInner] = useState(String(value ?? defaultValue ?? ''))
  const [over, setOver] = useState(0)
  const current = value !== undefined ? String(value) : inner

  return (
    <input {...rest} value={current} className={`${className}${over ? ` at-limit shake-${over % 2}` : ''}`}
      onChange={(e) => {
        const chars = Array.from(e.target.value)
        if (chars.length > max) { setOver((n) => n + 1); e.target.value = chars.slice(0, max).join('') }
        else if (over) setOver(0)
        setInner(e.target.value)
        onChange?.(e)
      }} />
  )
}
