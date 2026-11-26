import type { ReactNode } from 'react'
import { useOnline } from '../lib/network'

export function Screen({ header, children, footer, className = '' }: { header: ReactNode; children: ReactNode; footer?: ReactNode; className?: string }) {
  const online = useOnline()
  return (
    <div className={`screen ${className}`}>
      {/* Hors ligne : en-tête grisé + pastille « Hors ligne » à côté du titre (voir CSS) */}
      <header className={`topbar${online ? '' : ' offline'}`} title={online ? undefined : 'Hors ligne : tes messages partiront au retour du réseau'}>{header}</header>
      <main className="content">{children}</main>
      {footer}
    </div>
  )
}
