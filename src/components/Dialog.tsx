import { useEffect, useState } from 'react'

/** Remplace alert()/confirm() du navigateur (qui affichent l'adresse du site) par des fenêtres de l'appli. */
type Req = { text: string; confirm: boolean; resolve: (ok: boolean) => void }
let push: ((r: Req) => void) | null = null

export const ask = (text: string) => new Promise<boolean>((resolve) => push?.({ text, confirm: true, resolve }))
export const notify = (text: string) => { push?.({ text, confirm: false, resolve: () => {} }) }

export function DialogHost() {
  const [req, setReq] = useState<Req | null>(null)
  useEffect(() => { push = setReq; return () => { push = null } }, [])
  if (!req) return null
  const close = (ok: boolean) => { req.resolve(ok); setReq(null) }
  return (
    <div className="sheet-backdrop center-modal" onClick={() => close(false)}>
      <div className="dialog" onClick={(e) => e.stopPropagation()} role="alertdialog">
        <p>{req.text}</p>
        <div className="dialog-actions">
          {req.confirm && <button className="btn" onClick={() => close(false)}>Annuler</button>}
          <button className={`btn ${req.confirm ? 'danger-btn' : 'primary'}`} onClick={() => close(true)} autoFocus>
            {req.confirm ? 'Confirmer' : 'OK'}
          </button>
        </div>
      </div>
    </div>
  )
}
