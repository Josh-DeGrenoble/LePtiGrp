import type { ReactNode } from 'react'
import { IconNext } from './Icons'

type Props = {
  icon: ReactNode; color: string; label: ReactNode; sub?: ReactNode; right?: ReactNode
  onClick?: () => void; danger?: boolean; chevron?: boolean
}

/** Ligne de réglage : pastille d'icône colorée, libellé (+ sous-titre), et à droite une valeur, un interrupteur ou un chevron */
export function SRow({ icon, color, label, sub, right, onClick, danger, chevron = !!onClick }: Props) {
  const body = <>
    <span className="srow-icon" style={{ background: color }}>{icon}</span>
    <span className="srow-text"><span className={danger ? 'danger' : ''}>{label}</span>{sub && <small>{sub}</small>}</span>
    {right}
    {chevron && <span className="srow-chev"><IconNext /></span>}
  </>
  return onClick ? <button className="srow" onClick={onClick}>{body}</button> : <div className="srow">{body}</div>
}

/** Groupe de lignes, avec un titre et une note en dessous */
export function SGroup({ title, note, children }: { title?: string; note?: ReactNode; children: ReactNode }) {
  return <section className="sgroup">
    {title && <h2 className="sgroup-title">{title}</h2>}
    <div className="sgroup-card">{children}</div>
    {note && <div className="sgroup-note">{note}</div>}
  </section>
}
