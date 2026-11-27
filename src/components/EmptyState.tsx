import type { ReactNode } from 'react'

/** Écran vide illustré : pastille colorée (couleur de l'appli) avec une icône, un titre, un texte et une action */
export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <div className="empty-art" aria-hidden>
        <span className="empty-dot d1" /><span className="empty-dot d2" /><span className="empty-dot d3" />
        <span className="empty-icon">{icon}</span>
      </div>
      <div className="empty-title">{title}</div>
      {text && <div className="empty-text">{text}</div>}
      {action && <div className="empty-action">{action}</div>}
    </div>
  )
}
