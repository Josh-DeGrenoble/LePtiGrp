import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { IconCart, IconMail, IconMoney } from './Icons'

export function Screen({ header, children, nav = true, footer }: { header: ReactNode; children: ReactNode; nav?: boolean; footer?: ReactNode }) {
  return (
    <div className="screen">
      <header className="topbar">{header}</header>
      <main className="content">{children}</main>
      {footer}
      {nav && <BottomNav />}
    </div>
  )
}

/** Barre du bas : seul le chat est actif pour la V1 */
export function BottomNav() {
  return (
    <nav className="bottomnav">
      <NavLink to="/" className={({ isActive }) => (isActive ? 'active' : '')} aria-label="Discussions"><IconMail /></NavLink>
      <button disabled aria-label="Dépenses (bientôt)"><IconMoney /></button>
      <button disabled aria-label="Courses (bientôt)"><IconCart /></button>
    </nav>
  )
}
