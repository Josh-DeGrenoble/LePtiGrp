import type { ReactNode } from 'react'

export function Screen({ header, children, footer }: { header: ReactNode; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="screen">
      <header className="topbar">{header}</header>
      <main className="content">{children}</main>
      {footer}
    </div>
  )
}
