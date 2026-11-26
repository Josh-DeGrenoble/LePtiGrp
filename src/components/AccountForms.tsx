import { useState } from 'react'
import { supabase, errMsg } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Sheet } from './Sheet'
import { notify } from './Dialog'

type Kind = 'email' | 'password'

/** Changement d'email ou de mot de passe, après vérification du mot de passe actuel */
export function AccountForm({ kind, onClose }: { kind: Kind | null; onClose: () => void }) {
  const { session } = useAuth()
  const [current, setCurrent] = useState('')
  const [value, setValue] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const email = session?.user.email ?? ''

  const close = () => { setCurrent(''); setValue(''); setConfirm(''); setError(''); onClose() }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    if (kind === 'password' && value !== confirm) return setError('Les deux mots de passe ne correspondent pas')
    setBusy(true)
    try {
      const check = await supabase.auth.signInWithPassword({ email, password: current })
      if (check.error) throw new Error('Mot de passe actuel incorrect')
      const { error } = await supabase.auth.updateUser(kind === 'email' ? { email: value.trim() } : { password: value })
      if (error) throw error
      notify(kind === 'email'
        ? `Un lien de confirmation a été envoyé à ${value.trim()}. Ton email changera une fois le lien validé.`
        : 'Mot de passe modifié.')
      close()
    } catch (err) { setError(errMsg(err)) } finally { setBusy(false) }
  }

  return (
    <Sheet open={!!kind} onClose={close} title={kind === 'email' ? "Changer d'email" : 'Changer de mot de passe'}>
      <form className="form" onSubmit={submit}>
        {kind === 'email' ? <>
          <p className="muted small">Email actuel : {email}</p>
          <label className="field-label">Nouvel email
            <input type="email" placeholder="nouvel@email.fr" value={value} onChange={(e) => setValue(e.target.value)} required autoComplete="email" autoFocus />
          </label>
        </> : <>
          <label className="field-label">Nouveau mot de passe
            <input type="password" placeholder="6 caractères minimum" value={value} minLength={6} onChange={(e) => setValue(e.target.value)} required autoComplete="new-password" autoFocus />
          </label>
          <label className="field-label">Confirme le nouveau mot de passe
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required autoComplete="new-password" />
          </label>
        </>}
        <label className="field-label">Ton mot de passe actuel, pour confirmer
          <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoComplete="current-password" />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn primary" disabled={busy}>Valider</button>
      </form>
    </Sheet>
  )
}
