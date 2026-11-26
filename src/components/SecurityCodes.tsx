import { useEffect, useState } from 'react'
import type { Member } from '../lib/supabase'
import { fetchKeys, latestKey, keyChanged, acceptKey, setVerified, usePins, safetyCode } from '../lib/e2ee'
import { ask } from './Dialog'

/** Codes de sécurité des membres : à comparer avec ceux affichés sur leur téléphone (Paramètres > Chiffrement) */
export function SecurityCodes({ members, me }: { members: Member[]; me: string }) {
  const pins = usePins()
  const [loaded, setLoaded] = useState(false)
  useEffect(() => { if (loaded && location.hash === '#securite') document.getElementById('securite')?.scrollIntoView() }, [loaded])
  useEffect(() => { fetchKeys(members.map((m) => m.user_id), true).then(() => setLoaded(true)).catch(() => setLoaded(true)) }, [members])

  return (
    <div className="settings-block" id="securite">
      <div className="section-title">Chiffrement de bout en bout</div>
      <p className="muted small help">Les messages de cette conversation ne sont lisibles que par ses membres. Pour être sûr de parler à la bonne personne,
        compare son code avec celui affiché dans ses Paramètres (en face à face ou par appel), puis marque-le comme vérifié.</p>
      {loaded && members.filter((m) => m.user_id !== me).map((m) => {
        const k = latestKey(m.user_id)
        const changed = keyChanged(m.user_id)
        const name = m.profiles?.display_name ?? '?'
        return (
          <div key={m.user_id} className={`safety-row${changed ? ' changed' : ''}`}>
            <div className="safety-head">
              <b>{name}</b>
              <span className={`e2ee-tag${pins[m.user_id]?.verified ? ' ok' : changed ? ' warn' : ''}`}>
                {!k ? 'pas encore activé' : changed ? 'clé changée' : pins[m.user_id]?.verified ? 'vérifié' : 'non vérifié'}
              </span>
            </div>
            {k && <code className="safety-code">{safetyCode(k.sign_pk, k.box_pk)}</code>}
            {!k && <p className="muted small">Il ne pourra lire les messages qu'après avoir activé le chiffrement dans l'appli.</p>}
            {changed ? (
              <>
                <p className="small">Sa clé a changé : nouveau téléphone sans sa phrase, ou tentative d'interception. Vérifie le nouveau code avec lui avant d'accepter.</p>
                <button className="btn primary" onClick={async () => (await ask(`Accepter la nouvelle clé de ${name} ?`)) && acceptKey(m.user_id)}>Accepter la nouvelle clé</button>
              </>
            ) : k && (
              <button className="btn" onClick={() => setVerified(m.user_id, !pins[m.user_id]?.verified)}>
                {pins[m.user_id]?.verified ? 'Retirer « vérifié »' : 'Marquer comme vérifié'}
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
