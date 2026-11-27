import { useRef, useState, type ReactNode } from 'react'

/** Pop-up qui monte du bas de l'écran ; se ferme en touchant à côté ou en balayant vers le bas */
export function Sheet({ open, onClose, title, children, tall }: { open: boolean; onClose: () => void; title?: string; children: ReactNode; tall?: boolean }) {
  const [dy, setDy] = useState(0)
  const start = useRef<number | null>(null)
  if (!open) return null

  const onTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    // pas de balayage si le contenu est défilé ou si on manipule un élément qui gère son propre glisser
    const noSwipe = (e.target as HTMLElement).closest('[data-no-swipe], input[type=range]')
    start.current = e.currentTarget.scrollTop <= 0 && !noSwipe ? e.touches[0].clientY : null
  }
  const onTouchMove = (e: React.TouchEvent) => {
    if (start.current !== null) setDy(Math.max(0, e.touches[0].clientY - start.current))
  }
  const onTouchEnd = () => {
    if (dy > 90) onClose()
    setDy(0); start.current = null
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className={`sheet${tall ? ' tall' : ''}`} onClick={(e) => e.stopPropagation()} role="dialog"
        onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}
        style={dy ? { transform: `translateY(${dy}px)`, transition: 'none' } : undefined}>
        <div className="sheet-handle" />
        {title && <div className="sheet-title">{title}</div>}
        {children}
      </div>
    </div>
  )
}

export function SheetButton({ children, onClick, danger, disabled }: { children: ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return <button className={`sheet-btn${danger ? ' danger' : ''}`} onClick={onClick} disabled={disabled}>{children}</button>
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
