import { TAG_COLORS } from './friends'

/**
 * Couleur principale de l'appli (bleu roi par défaut), au choix parmi la palette des tags, gardée sur l'appareil.
 * Pour toute l'appli, chaque couleur de tag a une version un peu adoucie (moins « flash », texte blanc lisible).
 */
export const ACCENTS = TAG_COLORS
const SOFT: Record<string, string> = {
  '#2563eb': '#2563eb', // bleu roi
  '#f59e0b': '#d4901a', // jaune
  '#10b981': '#1f9b74', // vert
  '#ec4899': '#cf4d8a', // rose
  '#ef4444': '#d24b4b', // rouge
  '#14b8a6': '#1e968a', // turquoise
  '#8b5cf6': '#7a5ad8', // violet
  '#64748b': '#5b6b80', // ardoise
}
export const appColor = (tag: string) => SOFT[tag] ?? tag
const KEY = 'accent'

export function getAccent(): string {
  try { const v = localStorage.getItem(KEY); return v && ACCENTS.includes(v) ? v : ACCENTS[0] } catch { return ACCENTS[0] }
}
export function applyAccent(v = getAccent()) {
  const root = document.documentElement
  root.style.setProperty('--primary', appColor(v))
  root.style.setProperty('--mine', appColor(v))
  // jaune : les messages épinglés (jaunes aussi) prennent une autre couleur
  if (v === '#f59e0b') root.dataset.accent = 'amber'; else delete root.dataset.accent
}
export function setAccent(v: string) {
  try { localStorage.setItem(KEY, v) } catch { /* rien */ }
  applyAccent(v)
}
