import { useRef, useState } from 'react'
import { LimitedInput } from './LimitedInput'
import { IconClose, IconPlus, IconTrash } from './Icons'
import { between, qtyLabel, sections } from '../lib/notes'
import type { List, ListItem } from '../lib/supabase'

type Row = { key: string; cat: string | null; item?: ListItem }

export type EditorActions = {
  update: (item: ListItem, changes: Partial<ListItem>) => void
  add: (content: string, cat: string | null) => void
  remove: (item: ListItem) => void
  qty: (item: ListItem) => void
  addCategory: (name: string) => void
  renameCategory: (from: string, to: string) => void
  removeCategory: (cat: string) => void
}

/** Mode édition d'un pense-bête : éléments et catégories, tri par glisser-déposer avec la poignée ⠿ */
export function NoteEditor({ list, items, act }: { list: List | null; items: ListItem[]; act: EditorActions }) {
  const flat = (): Row[] => sections(list, items).flatMap((s) => [
    { key: `c:${s.cat ?? ''}`, cat: s.cat },
    ...s.items.map((i) => ({ key: `i:${i.id}`, cat: s.cat, item: i })),
  ])
  const [drag, setDrag] = useState<{ id: number; rows: Row[] } | null>(null)
  const els = useRef(new Map<string, HTMLElement>())
  const rows = drag?.rows ?? flat()

  // ---- Glisser-déposer (doigt ou souris) : l'élément change de place dès qu'on dépasse le milieu d'un voisin
  const start = (e: React.PointerEvent, item: ListItem) => {
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    setDrag({ id: item.id, rows: flat() })
  }
  const move = (e: React.PointerEvent) => {
    if (!drag) return
    const y = e.clientY
    const scroller = (e.currentTarget as HTMLElement).closest('.content')
    if (scroller) {  // défilement automatique près des bords
      const r = scroller.getBoundingClientRect()
      if (y < r.top + 50) scroller.scrollBy(0, -12)
      else if (y > r.bottom - 50) scroller.scrollBy(0, 12)
    }
    const at = drag.rows.findIndex((r) => r.item?.id === drag.id)
    const mid = (k: number) => { const b = els.current.get(drag.rows[k].key)!.getBoundingClientRect(); return b.top + b.height / 2 }
    let to = at
    while (to + 1 < drag.rows.length && y > mid(to + 1)) to++
    while (to - 1 > 0 && y < mid(to - 1)) to--  // jamais au-dessus du premier en-tête
    if (to === at) return
    const next = [...drag.rows]
    const [row] = next.splice(at, 1)
    next.splice(to, 0, row)
    setDrag({ ...drag, rows: next })
  }
  const end = () => {
    if (!drag) return
    const at = drag.rows.findIndex((r) => r.item?.id === drag.id)
    let h = at
    while (drag.rows[h].item) h--  // en-tête de catégorie au-dessus
    const cat = drag.rows[h].cat
    const prev = drag.rows[at - 1]?.item
    const next = drag.rows[at + 1]?.item
    const item = drag.rows[at].item!
    setDrag(null)
    const position = between(prev, next)
    if (position !== item.position || cat !== item.category) act.update(item, { category: cat, position })
  }

  return (
    <div className="note-editor" onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
      {rows.map((r, idx) => {
        const ref = (el: HTMLElement | null) => { if (el) els.current.set(r.key, el); else els.current.delete(r.key) }
        if (!r.item) {
          const lastOfCat = idx + 1 >= rows.length || !rows[idx + 1].item
          return <div key={r.key}><div ref={ref} className={`edit-cat${r.cat === null ? ' none' : ''}`}>
            {r.cat === null ? <span>Sans catégorie</span> : <>
              <LimitedInput max={30} defaultValue={r.cat} key={r.cat} aria-label="Nom de la catégorie"
                onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== r.cat) act.renameCategory(r.cat!, v) }}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
              <button className="icon-btn" onClick={() => act.removeCategory(r.cat!)} aria-label="Supprimer la catégorie"><IconTrash size={18} /></button>
            </>}
          </div>{lastOfCat && <AddItem cat={r.cat} onAdd={act.add} />}</div>
        }
        const i = r.item
        const isLast = idx + 1 >= rows.length || !rows[idx + 1].item
        return <div key={r.key}>
          <div ref={ref} className={`edit-item${drag?.id === i.id ? ' dragging' : ''}`}>
            <span className="drag-handle" onPointerDown={(e) => start(e, i)} aria-label="Déplacer">⠿</span>
            <LimitedInput max={100} defaultValue={i.content} key={i.content} aria-label="Élément"
              onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== i.content) act.update(i, { content: v }) }}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
            <button className={`qty-pill${qtyLabel(i) ? ' set' : ''}`} onClick={() => act.qty(i)}>{qtyLabel(i) ?? 'Qté'}</button>
            <button className="icon-btn" onClick={() => act.remove(i)} aria-label="Supprimer"><IconClose /></button>
          </div>
          {isLast && <AddItem cat={r.cat} onAdd={act.add} />}
        </div>
      })}
      {!drag && <NewCategory onAdd={act.addCategory} />}
    </div>
  )
}

function AddItem({ cat, onAdd }: { cat: string | null; onAdd: (c: string, cat: string | null) => void }) {
  const [v, setV] = useState('')
  const input = useRef<HTMLInputElement>(null)
  return (
    <form className="edit-add" onSubmit={(e) => { e.preventDefault(); if (v.trim()) { onAdd(v.trim(), cat); setV(''); input.current?.focus() } }}>
      <IconPlus size={18} />
      <LimitedInput ref={input} max={100} placeholder={cat ? `Ajouter dans ${cat}…` : 'Ajouter un élément…'} value={v} onChange={(e) => setV(e.target.value)} />
    </form>
  )
}

function NewCategory({ onAdd }: { onAdd: (name: string) => void }) {
  const [v, setV] = useState('')
  return (
    <form className="edit-newcat" onSubmit={(e) => { e.preventDefault(); if (v.trim()) { onAdd(v.trim()); setV('') } }}>
      <LimitedInput max={30} placeholder="Nouvelle catégorie (ex. Bouffe)" value={v} onChange={(e) => setV(e.target.value)} />
      <button className="btn" disabled={!v.trim()}>Créer</button>
    </form>
  )
}
