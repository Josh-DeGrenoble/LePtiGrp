/** Taille du texte du chat et de la liste des convs (pour les personnes malvoyantes), gardée sur l'appareil */
export const TEXT_SCALES = [1, 1.5, 2, 3] as const
const KEY = 'text-scale'

export function getTextScale(): number {
  try { const v = Number(localStorage.getItem(KEY)); return TEXT_SCALES.includes(v as 1) ? v : 1 } catch { return 1 }
}
export function applyTextScale(v = getTextScale()) {
  document.documentElement.style.setProperty('--ts', String(v))
}
export function setTextScale(v: number) {
  try { localStorage.setItem(KEY, String(v)) } catch { /* rien */ }
  applyTextScale(v)
}
