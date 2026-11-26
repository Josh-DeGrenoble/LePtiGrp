import { useState } from 'react'
import { restore, newKeys, unlock, createKeys, forgotKeys, parsePhrase, initE2EE, type E2EEState } from '../lib/e2ee'
import { supabase, errMsg } from '../lib/supabase'
import { ask } from '../components/Dialog'

/** Écran affiché tant que les clés de chiffrement ne sont pas prêtes sur cet appareil (cas rares) */
export default function E2EESetup({ state, uid, email, hasPassword }: { state: E2EEState; uid: string; email: string; hasPassword: boolean }) {
  if (state === 'loading') return <div className="splash">LePtiGrp</div>
  if (state === 'offline') return (
    <div className="login e2ee">
      <h1>🔒 Connexion nécessaire</h1>
      <p>Pour récupérer tes clés de chiffrement sur ce téléphone, il faut du réseau.</p>
      <button className="btn primary" onClick={() => initE2EE(uid)}>Réessayer</button>
    </div>
  )
  if (state === 'password') return <Unlock uid={uid} hasPassword={hasPassword} />
  if (state === 'create') return hasPassword ? <Unlock uid={uid} hasPassword email={email} create /> : <Choose uid={uid} />
  if (state === 'reset') return <Reset uid={uid} />
  return <Restore uid={uid} />
}

const SignOut = () => <button className="link" onClick={() => supabase.auth.signOut()}>Se déconnecter</button>
const pwName = (hasPassword: boolean) => hasPassword ? 'ton mot de passe' : 'ton mot de passe de chiffrement'

/** Session ouverte mais clés pas sur ce téléphone : on demande le mot de passe une fois */
function Unlock({ uid, hasPassword, email, create }: { uid: string; hasPassword: boolean; email?: string; create?: boolean }) {
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [forgot, setForgot] = useState(false)
  const go = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr('')
    try { await (create ? createKeys(uid, password, email) : unlock(uid, password)) } catch (x) { setErr(errMsg(x)); setBusy(false) }
  }
  if (forgot) return <Choose uid={uid} forgot onBack={() => setForgot(false)} />
  return (
    <form className="login e2ee" onSubmit={go}>
      <h1>🔒 Déverrouiller tes messages</h1>
      <p>Tes messages sont chiffrés. Saisis {pwName(hasPassword)} pour les relire sur ce téléphone.</p>
      <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={hasPassword ? 'Mot de passe' : 'Mot de passe de chiffrement'} autoComplete="current-password" required autoFocus />
      {err && <p className="error">{err}</p>}
      <button className="btn primary" disabled={busy || !password}>{busy ? 'Déverrouillage…' : 'Déverrouiller'}</button>
      {!hasPassword && !create && <button type="button" className="link danger" onClick={() => setForgot(true)}>J'ai oublié mon mot de passe de chiffrement</button>}
      <SignOut />
    </form>
  )
}

/** Compte Google : choix du mot de passe de chiffrement (première fois, ou après un oubli) */
function Choose({ uid, forgot, onBack }: { uid: string; forgot?: boolean; onBack?: () => void }) {
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const go = async (e: React.FormEvent) => {
    e.preventDefault()
    if (pw !== pw2) return setErr('Les deux mots de passe ne correspondent pas')
    if (forgot && !(await ask('Repartir avec de nouvelles clés ? Tes anciens messages chiffrés resteront illisibles pour toujours.'))) return
    setBusy(true); setErr('')
    try { await (forgot ? forgotKeys(uid, pw) : createKeys(uid, pw)) } catch (x) { setErr(errMsg(x)); setBusy(false) }
  }
  return (
    <form className="login e2ee" onSubmit={go}>
      <h1>🔒 {forgot ? 'Nouveau mot de passe de chiffrement' : 'Ton mot de passe de chiffrement'}</h1>
      <ul className="e2ee-points">
        <li>🔐 Tes messages sont chiffrés de bout en bout. Ce mot de passe protège tes clés : <b>ni Google ni le serveur ne le connaissent</b>.</li>
        <li>📱 Il te sera demandé seulement sur un nouveau téléphone.</li>
        <li>⚠️ <b>Oublié = anciens messages perdus.</b> Choisis-en un dont tu te souviendras.</li>
      </ul>
      <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Mot de passe de chiffrement" autoComplete="new-password" required minLength={8} autoFocus />
      <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="Confirme-le" autoComplete="new-password" required />
      <p className={`pw-rule${pw.length >= 8 ? ' ok' : ''}`}>{pw.length >= 8 ? '✓' : '○'} 8 caractères minimum</p>
      {err && <p className="error">{err}</p>}
      <button className="btn primary" disabled={busy || pw.length < 8 || !pw2}>{busy ? 'Création des clés…' : 'Valider'}</button>
      {onBack ? <button type="button" className="link" onClick={onBack}>Retour</button> : <SignOut />}
    </form>
  )
}

/** Mot de passe réinitialisé hors de l'appli : l'ancienne sauvegarde ne s'ouvre plus */
function Reset({ uid }: { uid: string }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const go = async () => {
    setBusy(true)
    try { await newKeys(uid) } catch (x) { setErr(errMsg(x)); setBusy(false) }
  }
  return (
    <div className="login e2ee">
      <h1>⚠️ Mot de passe réinitialisé</h1>
      <p>Ton mot de passe a été réinitialisé : tes anciens messages chiffrés ne peuvent plus être déchiffrés, par personne.</p>
      <p>Tu peux continuer avec de nouvelles clés. Tes amis verront que ta clé de sécurité a changé.</p>
      {err && <p className="error">{err}</p>}
      <button className="btn primary" disabled={busy} onClick={go}>Continuer avec de nouvelles clés</button>
      <SignOut />
    </div>
  )
}

/** Compte activé avec l'ancienne phrase de 12 mots, jamais sauvegardé avec le mot de passe */
function Restore({ uid }: { uid: string }) {
  const [text, setText] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const go = async () => {
    const p = parsePhrase(text)
    if (!p.entropy) return setErr(p.error ?? 'Phrase invalide.')
    setBusy(true); setErr('')
    try { await restore(uid, p.entropy) } catch (e) { setErr(errMsg(e)); setBusy(false) }
  }
  const lost = async () => {
    if (!(await ask('Repartir avec de nouvelles clés ? Tes anciens messages chiffrés resteront illisibles.'))) return
    setBusy(true)
    try { await newKeys(uid) } catch (e) { setErr(errMsg(e)); setBusy(false) }
  }

  return (
    <div className="login e2ee">
      <h1>🔒 Ta phrase de récupération</h1>
      <p>Une dernière fois, saisis les 12 mots notés à l'activation. Ensuite, ton mot de passe suffira.</p>
      <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="mot1 mot2 mot3 …"
        autoCapitalize="none" autoComplete="off" autoCorrect="off" spellCheck={false} />
      {err && <p className="error">{err}</p>}
      <button className="btn primary" disabled={busy || !text.trim()} onClick={go}>Déverrouiller</button>
      <button className="link danger" onClick={lost}>Je n'ai pas noté la phrase</button>
      <SignOut />
    </div>
  )
}

const seenKey = (uid: string) => `e2ee-info:${uid}`
/** L'écran d'info a-t-il déjà été vu pour ce compte ? (mémorisé dans le compte, et sur le téléphone en secours) */
export function infoSeen(uid: string, meta: Record<string, unknown> | undefined) {
  if (meta?.e2ee_info_seen) return true
  try { return localStorage.getItem(seenKey(uid)) === '1' } catch { return false }
}

/** Affiché une seule fois, à la première connexion */
export function E2EEInfo({ uid, onDone }: { uid: string; onDone: () => void }) {
  const ok = () => {
    try { localStorage.setItem(seenKey(uid), '1') } catch { /* rien */ }
    supabase.auth.updateUser({ data: { e2ee_info_seen: true } }).then(() => {}, () => {})
    onDone()
  }
  return (
    <div className="login e2ee">
      <h1>🔒 Tes messages sont chiffrés</h1>
      <ul className="e2ee-points">
        <li>🔐 Tes messages sont <b>chiffrés de bout en bout</b> : seuls les membres de la conversation peuvent les lire, pas même le serveur.</li>
        <li>🔑 Tes clés sont protégées par <b>ton mot de passe</b>, qui ne quitte jamais ton téléphone. Connecte-toi sur un autre téléphone : tout est là.</li>
        <li>⚠️ <b>Mot de passe oublié et réinitialisé = anciens messages perdus.</b> Personne ne pourra les récupérer. Choisis un mot de passe dont tu te souviens.</li>
        <li>✅ <b>Changer ton mot de passe</b> dans Paramètres, en revanche, ne fait rien perdre.</li>
      </ul>
      <button className="btn primary" onClick={ok}>Compris</button>
    </div>
  )
}

/** Compte avec un mot de passe (inscription par email) ? Sinon : connexion Google seule */
export function hasPassword(user: { app_metadata?: { providers?: string[]; provider?: string } }) {
  const p = user.app_metadata?.providers ?? [user.app_metadata?.provider]
  return p.includes('email')
}
