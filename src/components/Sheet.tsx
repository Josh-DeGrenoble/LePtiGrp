import { useEffect, useRef, useState, type ReactNode } from 'react'

const TYPABLE = 'input:not([type=date]):not([type=time]):not([type=datetime-local]):not([type=range]):not([type=checkbox]):not([type=radio]):not([disabled]), textarea'

/**
 * Pop-up qui monte du bas de l'écran ; se ferme en touchant à côté ou en balayant vers le bas.
 * `form` : pop-up de saisie, accrochée en HAUT de l'écran : le clavier s'ouvre en bas sans rien faire bouger
 * (les champs restent à leur place, clavier ouvert ou fermé). `autoFocus` : clavier ouvert sur le 1er champ.
 */
export function Sheet({ open, onClose, title, children, tall, form, autoFocus }: {
  open: boolean; onClose: () => void; title?: string; children: ReactNode; tall?: boolean; form?: boolean; autoFocus?: boolean
}) {
  const [dy, setDy] = useState(0)
  const start = useRef<number | null>(null)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (open && autoFocus) box.current?.querySelector<HTMLElement>(TYPABLE)?.focus({ preventScroll: true })
  }, [open, autoFocus])
  if (!open) return null
  // en haut : on balaie vers le haut pour fermer
  const dir = form ? -1 : 1

  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    // pas de balayage si le contenu est défilé ou si on manipule un élément qui gère son propre glisser
    const noSwipe = (e.target as HTMLElement).closest('[data-no-swipe], input[type=range]')
    start.current = e.currentTarget.scrollTop <= 0 && !noSwipe ? e.touches[0].clientY : null
  }
  const onTouchMove = (e: React.TouchEvent) => {
    if (start.current !== null) setDy(Math.max(0, dir * (e.touches[0].clientY - start.current)))
  }
  const onTouchEnd = () => {
    if (dy > 90) onClose()
    setDy(0); start.current = null
  }

  return (
    <div className={`sheet-backdrop${form ? ' top' : ''}`} onClick={onClose}>
      <div ref={box} className={`sheet${tall ? ' tall' : ''}${form ? ' form' : ''}`} onClick={(e) => e.stopPropagation()} role="dialog"
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}
        style={dy ? { transform: `translateY(${dir * dy}px)`, transition: 'none' } : undefined}>
        {!form && <div className="sheet-handle" />}
        {title && <div className="sheet-title">{title}</div>}
        {children}
        {form && <div className="sheet-handle bottom" />}
      </div>
    </div>
  )
}

export function SheetButton({ children, onClick, danger, disabled, icon }: { children: ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean; icon?: ReactNode }) {
  return <button className={`sheet-btn${danger ? ' danger' : ''}${icon ? ' with-icon' : ''}`} onClick={onClick} disabled={disabled}>{icon}{children}</button>
}

export function Toggle({ label, checked, onChange, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <label className={`toggle-row${disabled ? ' disabled' : ''}`}>
      <span>{label}</span>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle" />
    </label>
  )
}
