import { LimitedInput } from '../components/LimitedInput'
import { useState } from 'react'
import { errMsg, supabase } from '../lib/supabase'
import { signIn, signUp } from '../lib/e2ee'

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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (mode === 'signup' && name.includes('@')) return setError('Mets ton prénom ou pseudo, pas ton email.')
    setError(''); setInfo(''); setBusy(true)
    try {
      if (mode === 'login') {
        await signIn(email, password)
      } else if (!(await signUp(email, password, name))) {
        setMode('login'); setConfirm(true)  // email et mot de passe restent remplis
      }
    } catch (err) {
      if (/email not confirmed/i.test(errMsg(err) + String((err as { message?: string })?.message))) setConfirm(true)
      else setError(errMsg(err))
    } finally { setBusy(false) }
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
      <button className="link" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
        {mode === 'login' ? "Pas encore de compte ? S'inscrire" : 'Déjà un compte ? Se connecter'}
      </button>
    </div>
  )
}
