import { TAG_COLORS } from './friends'

/** Couleur principale de l'appli (bleu roi par défaut), au choix parmi la palette des tags, gardée sur l'appareil */
export const ACCENTS = TAG_COLORS
const KEY = 'accent'

export function getAccent(): string {
  try { const v = localStorage.getItem(KEY); return v && ACCENTS.includes(v) ? v : ACCENTS[0] } catch { return ACCENTS[0] }
}
export function applyAccent(v = getAccent()) {
  const s = document.documentElement.style
  s.setProperty('--primary', v)
  s.setProperty('--mine', v)
}
export function setAccent(v: string) {
  try { localStorage.setItem(KEY, v) } catch { /* rien */ }
  applyAccent(v)
}
