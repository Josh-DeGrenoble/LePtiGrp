import type { List, ListItem } from './supabase'

export type Section = { cat: string | null; items: ListItem[] }

const pos = (i: ListItem) => i.position ?? i.id

/** Éléments rangés par catégorie (sans catégorie d'abord), chacune dans l'ordre choisi */
export function sections(list: List | null, items: ListItem[]): Section[] {
  const cats = [...(list?.categories ?? [])]
  for (const i of items) if (i.category && !cats.includes(i.category)) cats.push(i.category)
  return [null, ...cats].map((cat) => ({
    cat, items: items.filter((i) => (i.category ?? null) === cat).sort((a, b) => pos(a) - pos(b)),
  }))
}

/** Position d'un élément placé entre deux voisins (ou en bout de catégorie) */
export function between(prev?: ListItem, next?: ListItem) {
  if (prev && next) return (pos(prev) + pos(next)) / 2
  if (prev) return pos(prev) + 1
  if (next) return pos(next) - 1
  return 1
}

/** Libellé court de la quantité : « 3 kg » (à prendre) ou « 25 % » (restant) */
export const qtyLabel = (i: ListItem) =>
  i.qty_kind === 'left' ? (i.level !== null ? `${i.level} %` : null) : i.quantity
