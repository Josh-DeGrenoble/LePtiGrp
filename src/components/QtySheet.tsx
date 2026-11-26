import { useState } from 'react'
import { Sheet } from './Sheet'
import { LimitedInput } from './LimitedInput'
import type { ListItem, QtyKind } from '../lib/supabase'

type Qty = Pick<ListItem, 'qty_kind' | 'quantity' | 'level'>

/** Quantité d'un élément : « À prendre » (texte libre, ex. 3 kg) ou « Restant » (niveau en %) */
export function QtySheet({ item, onClose, onSave }: { item: ListItem; onClose: () => void; onSave: (q: Qty) => void }) {
  const [kind, setKind] = useState<QtyKind>(item.qty_kind ?? 'take')
  const [quantity, setQuantity] = useState(item.quantity ?? '')
  const [level, setLevel] = useState(item.level ?? 50)

  const save = () => onSave(kind === 'take'
    ? { qty_kind: 'take', quantity: quantity.trim() || null, level: null }
    : { qty_kind: 'left', quantity: null, level })

  return (
    <Sheet open onClose={onClose} title={item.content}>
      <div className="segmented share-modes">
        <button className={kind === 'take' ? 'on' : ''} onClick={() => setKind('take')}>À prendre</button>
        <button className={kind === 'left' ? 'on' : ''} onClick={() => setKind('left')}>Restant</button>
      </div>
      {kind === 'take' ? <>
        <LimitedInput max={20} autoFocus placeholder="ex. 3, 3 kg, 2 paquets" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
        <p className="muted small share-hint">Chacun pourra cocher et dire combien il en prend.</p>
      </> : <>
        <div className="level-value">{level} %</div>
        <input type="range" min={0} max={100} step={5} value={level} onChange={(e) => setLevel(Number(e.target.value))} aria-label="Niveau restant" data-no-swipe />
        <div className="chip-row">
          {[0, 25, 50, 75].map((v) => <button key={v} className={`chip quick${level === v ? ' on' : ''}`} onClick={() => setLevel(v)}>{v} %</button>)}
        </div>
        <p className="muted small share-hint">Ce qu'il reste à la maison (ex. 25 % de shampoing).</p>
      </>}
      <div className="inline-form">
        <button className="btn" onClick={() => onSave({ qty_kind: 'take', quantity: null, level: null })}>Aucune</button>
        <button className="btn primary wide" onClick={save}>OK</button>
      </div>
    </Sheet>
  )
}
