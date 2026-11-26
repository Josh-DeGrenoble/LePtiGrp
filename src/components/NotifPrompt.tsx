import { useEffect, useState } from 'react'
import { enablePush, pushState } from '../lib/push'
import { errMsg } from '../lib/supabase'
import { notify } from './Dialog'

const KEY = 'notif-asked'

/**
 * Premier lancement : propose d'activer les notifications.
 * Les téléphones (iPhone comme Android) n'affichent la demande système qu'après un toucher,
 * d'où cette fenêtre : le bouton « Activer » déclenche directement la demande du téléphone.
 */
export function NotifPrompt() {
  const [show, setShow] = useState(false)

  useEffect(() => {
    let asked = false
    try { asked = localStorage.getItem(KEY) === '1' } catch { /* stockage bloqué */ }
    if (asked || !('Notification' in window) || Notification.permission !== 'default') return
    const t = setTimeout(() => pushState().then((s) => setShow(s === 'off')), 800)
    return () => clearTimeout(t)
  }, [])

  const close = () => { try { localStorage.setItem(KEY, '1') } catch { /* rien */ } setShow(false) }
  const activate = async () => {
    close()
    try { await enablePush() } catch (e) { if (errMsg(e) !== 'denied') notify(errMsg(e)) }
  }

  if (!show) return null
  return (
    <div className="sheet-backdrop center-modal">
      <div className="dialog notif-prompt" role="dialog">
        <div className="notif-bell">🔔</div>
        <p><b>Activer les notifications ?</b><br />Pour être prévenu des nouveaux messages, des mentions et des messages épinglés. Tu pourras régler ça pour chaque conversation.</p>
        <div className="dialog-actions">
          <button className="btn" onClick={close}>Plus tard</button>
          <button className="btn primary" onClick={activate} autoFocus>Activer</button>
        </div>
      </div>
    </div>
  )
}
