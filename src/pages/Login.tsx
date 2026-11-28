import { LimitedInput } from '../components/LimitedInput'
import { useRef, useState } from 'react'
import { errMsg, supabase } from '../lib/supabase'
import { signIn, signUp } from '../lib/e2ee'

/** Réseau qui ne répond pas : on rend la main au bout de 30 s au lieu de tourner sans fin */
const withTimeout = <T,>(p: Promise<T>) => Promise.race([p,
  new Promise<never>((_, no) => setTimeout(() => no(new Error('Le serveur ne répond pas : vérifie ton réseau et réessaie.')), 30000))])

export default function Login() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  // compte créé, email pas encore validé : bandeau + renvoi possible
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  // garde-fou immédiat contre le double clic (l'état `busy` n'est pris en compte qu'au rendu suivant)
  const lock = useRef(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (lock.current) return
    if (mode === 'signup' && name.includes('@')) return setError('Mets ton prénom ou pseudo, pas ton email.')
    lock.current = true
    setError(''); setInfo(''); setBusy(true)
    try {
      if (mode === 'login') {
        await withTimeout(signIn(email, password))
      } else if (!(await withTimeout(signUp(email, password, name)))) {
        setMode('login'); setConfirm(true)  // email et mot de passe restent remplis
      }
    } catch (err) {
      if (/email not confirmed/i.test(errMsg(err) + String((err as { message?: string })?.message))) setConfirm(true)
      else setError(errMsg(err))
    } finally { lock.current = false; setBusy(false) }
  }

  const google = async () => {
    if (lock.current) return
    lock.current = true; setBusy(true); setError('')
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })
    if (error) { setError(errMsg(error)); lock.current = false; setBusy(false) }
  }

  const resend = async () => {
    const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo: `${window.location.origin}/confirmed` } })
    setInfo(error ? errMsg(error) : `Email renvoyé à ${email}.`)
  }

  return (
    <div className="login">
      <h1 className="logo">LePtiGrp</h1>
      {confirm && mode === 'login' && <div className="confirm-banner">
        <b>📧 Plus qu'une étape !</b>
        <p>Valide ton email via le lien reçu à <b>{email}</b> (pense aux spams), puis connecte-toi ici.</p>
        <button className="link" type="button" onClick={resend}>Renvoyer l'email</button>
      </div>}
      <form onSubmit={submit} className="card form">
        <input type="email" name="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value.trim())} required maxLength={254} autoComplete="email" inputMode="email" />
        {mode === 'signup' && <>
          {/* nickname : le navigateur n'y colle pas l'email (sinon coupé à 30 caractères) */}
          <LimitedInput name="nickname" autoComplete="nickname" placeholder="Ton prénom ou pseudo (30 caractères max)" value={name} onChange={(e) => setName(e.target.value)} required max={30} />
          {name.includes('@') && <p className="error">Ici c'est ton prénom ou pseudo, pas ton email 🙂</p>}
        </>}
        <input type="password" placeholder="Mot de passe" value={password} onChange={(e) => setPassword(e.target.value)} required
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
        {mode === 'signup' && <p className={`pw-rule${password.length >= 8 ? ' ok' : ''}`}>
          {password.length >= 8 ? '✓' : '○'} 8 caractères minimum{password.length > 0 && password.length < 8 && ` (encore ${8 - password.length})`}
        </p>}
        {error && <p className="error">{error}</p>}
        {info && <p className="info">{info}</p>}
        <button className="btn primary" disabled={busy || (mode === 'signup' && password.length < 8)}>{busy ? 'Connexion sécurisée…' : mode === 'login' ? 'Se connecter' : 'Créer mon compte'}</button>
      </form>
      <div className="or-sep"><span>ou</span></div>
      <button className="btn google-btn" type="button" onClick={google} disabled={busy}>
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z"/><path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z"/></svg>
        Continuer avec Google
      </button>
      <button className="link" disabled={busy} onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
        {mode === 'login' ? "Pas encore de compte ? S'inscrire" : 'Déjà un compte ? Se connecter'}
      </button>
      <a className="legal-link" href="/confidentialite">Règles de confidentialité</a>
    </div>
  )
}
