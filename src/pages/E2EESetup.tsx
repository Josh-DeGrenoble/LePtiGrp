import { useMemo, useState } from 'react'
import { activate, restore, startOver, genEntropy, phraseOf, parsePhrase, initE2EE, type E2EEState } from '../lib/e2ee'
import { supabase, errMsg } from '../lib/supabase'
import { ask } from '../components/Dialog'

/** Écran bloquant tant que le chiffrement n'est pas prêt sur cet appareil */
export default function E2EESetup({ state, uid }: { state: E2EEState; uid: string }) {
  if (state === 'loading') return <div className="splash">LePtiGrp</div>
  if (state === 'offline') return (
    <div className="login e2ee">
      <h1>🔒 Connexion nécessaire</h1>
      <p>Pour configurer le chiffrement sur ce téléphone, il faut du réseau.</p>
      <button className="btn primary" onClick={() => initE2EE(uid)}>Réessayer</button>
    </div>
  )
  if (state === 'setup') return <Create uid={uid} />
  return <Restore uid={uid} changed={state === 'changed'} />
}

function Risks() {
  return (
    <ul className="e2ee-points">
      <li>🔒 Tes messages sont chiffrés sur ton téléphone : <b>personne d'autre que les membres de la conversation ne peut les lire</b>, pas même le serveur.</li>
      <li>📝 Ta <b>phrase de 12 mots</b> est la seule clé. Elle te sera demandée sur un nouveau téléphone, ou après une déconnexion.</li>
      <li>⚠️ <b>Phrase perdue = historique perdu.</b> Personne ne pourra te la renvoyer ni récupérer tes messages, ni nous, ni le mot de passe du compte.</li>
      <li>🙈 Ne la donne à personne et ne la prends pas en photo : qui l'a peut lire tes messages.</li>
    </ul>
  )
}

function Create({ uid }: { uid: string }) {
  const [step, setStep] = useState<'intro' | 'show' | 'check'>('intro')
  const entropy = useMemo(() => genEntropy(), [])
  const words = useMemo(() => phraseOf(entropy), [entropy])
  // Vérification : deux mots tirés au hasard
  const [[a, b]] = useState(() => [Math.floor(Math.random() * 6), 6 + Math.floor(Math.random() * 6)])
  const [wa, setWa] = useState('')
  const [wb, setWb] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const same = (x: string, w: string) => x.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '') === w.normalize('NFD').replace(/[̀-ͯ]/g, '')
  const finish = async () => {
    if (!same(wa, words[a]) || !same(wb, words[b])) return setErr('Ce ne sont pas les bons mots : vérifie ta phrase notée.')
    setBusy(true)
    try { await activate(uid, entropy) } catch (e) { setErr(errMsg(e)); setBusy(false) }
  }

  if (step === 'intro') return (
    <div className="login e2ee">
      <h1>🔒 Chiffrement de bout en bout</h1>
      <Risks />
      <button className="btn primary" onClick={() => setStep('show')}>Créer ma phrase de récupération</button>
      <button className="link" onClick={() => supabase.auth.signOut()}>Se déconnecter</button>
    </div>
  )
  if (step === 'show') return (
    <div className="login e2ee">
      <h1>Note ces 12 mots</h1>
      <p>Sur papier, dans l'ordre, et garde-les en lieu sûr.</p>
      <ol className="phrase-grid">{words.map((w, i) => <li key={i}><span>{i + 1}</span>{w}</li>)}</ol>
      <button className="btn primary" onClick={() => setStep('check')}>Je les ai notés</button>
    </div>
  )
  return (
    <div className="login e2ee">
      <h1>Vérification</h1>
      <p>Pour être sûr que ta phrase est bien notée :</p>
      <label>Mot n° {a + 1}<input value={wa} onChange={(e) => setWa(e.target.value)} autoCapitalize="none" autoComplete="off" autoCorrect="off" spellCheck={false} /></label>
      <label>Mot n° {b + 1}<input value={wb} onChange={(e) => setWb(e.target.value)} autoCapitalize="none" autoComplete="off" autoCorrect="off" spellCheck={false} /></label>
      {err && <p className="error">{err}</p>}
      <button className="btn primary" disabled={busy || !wa || !wb} onClick={finish}>Activer le chiffrement</button>
      <button className="link" onClick={() => { setErr(''); setStep('show') }}>Revoir la phrase</button>
    </div>
  )
}

function Restore({ uid, changed }: { uid: string; changed: boolean }) {
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
    if (!(await ask('Créer une nouvelle phrase ? Tes anciens messages chiffrés resteront illisibles pour toujours, et tes amis verront que ta clé a changé.'))) return
    startOver()
  }

  return (
    <div className="login e2ee">
      <h1>🔒 Ta phrase de récupération</h1>
      <p>{changed
        ? 'Ta phrase a été refaite sur un autre appareil. Saisis la nouvelle pour continuer sur ce téléphone.'
        : 'Saisis les 12 mots notés à l\'activation pour retrouver tes messages sur ce téléphone.'}</p>
      <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="mot1 mot2 mot3 …"
        autoCapitalize="none" autoComplete="off" autoCorrect="off" spellCheck={false} />
      <p className="muted small">Les accents sont facultatifs, les 4 premières lettres de chaque mot suffisent.</p>
      {err && <p className="error">{err}</p>}
      <button className="btn primary" disabled={busy || !text.trim()} onClick={go}>Déverrouiller</button>
      <button className="link danger" onClick={lost}>J'ai perdu ma phrase</button>
      <button className="link" onClick={() => supabase.auth.signOut()}>Se déconnecter</button>
    </div>
  )
}
