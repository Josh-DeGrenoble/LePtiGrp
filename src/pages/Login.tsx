import { useState } from 'react'
import { supabase, errMsg } from '../lib/supabase'

export default function Login() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(''); setInfo(''); setBusy(true)
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { display_name: name } } })
        if (error) throw error
        if (!data.session) setInfo('Compte créé. Valide le lien reçu par mail, puis connecte-toi.')
      }
    } catch (err) {
      setError(errMsg(err) === 'Invalid login credentials' ? 'Email ou mot de passe incorrect' : errMsg(err))
    } finally { setBusy(false) }
  }

  return (
    <div className="login">
      <h1 className="logo">LePtiGrp</h1>
      <form onSubmit={submit} className="card form">
        {mode === 'signup' && (
          <input placeholder="Ton prénom / pseudo" value={name} onChange={(e) => setName(e.target.value)} required maxLength={30} />
        )}
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        <input type="password" placeholder="Mot de passe" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6}
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
        {error && <p className="error">{error}</p>}
        {info && <p className="info">{info}</p>}
        <button className="btn primary" disabled={busy}>{mode === 'login' ? 'Se connecter' : 'Créer mon compte'}</button>
      </form>
      <button className="link" onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}>
        {mode === 'login' ? "Pas encore de compte ? S'inscrire" : 'Déjà un compte ? Se connecter'}
      </button>
    </div>
  )
}
