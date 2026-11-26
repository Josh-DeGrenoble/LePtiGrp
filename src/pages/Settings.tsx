import { BackButton } from '../components/BackButton'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Screen } from '../components/Layout'
import { Avatar } from '../components/Avatar'
import { IconShare } from '../components/Icons'
import { ProfileEditor } from '../components/ProfileEditor'
import { AdminFeedback, DevSection } from '../components/Feedback'
import { AccountForm } from '../components/AccountForms'
import { ask, notify } from '../components/Dialog'
import { Sheet, Toggle } from '../components/Sheet'
import { pushState, enablePush, disablePush, isIos, type PushState } from '../lib/push'
import { useOnResume } from '../lib/network'
import { errMsg } from '../lib/supabase'
import { identity, safetyCode } from '../lib/e2ee'
import { b64 } from '../lib/crypto/core'

export default function Settings() {
  const { session, profile } = useAuth()
  const [editProfile, setEditProfile] = useState(false)
  const [copied, setCopied] = useState(false)
  const [account, setAccount] = useState<'email' | 'password' | null>(null)
  const [deleting, setDeleting] = useState(false)
  const appUrl = window.location.origin
  const [push, setPush] = useState<PushState | null>(null)
  useEffect(() => { pushState().then(setPush) }, [])
  // Au retour des réglages du téléphone : si l'autorisation a été donnée, on active tout de suite
  const recheck = useCallback(async () => {
    const st = await pushState()
    if (st === 'off' && 'Notification' in window && Notification.permission === 'granted') {
      try { await enablePush() } catch { /* on laisse l'interrupteur */ }
      setPush(await pushState())
    } else setPush(st)
  }, [])
  useOnResume(recheck)

  const togglePush = async (on: boolean) => {
    try { await (on ? enablePush() : disablePush()) } catch (e) { if (errMsg(e) !== 'denied') notify(errMsg(e)) }
    setPush(await pushState())
  }

  const copy = async () => {
    await navigator.clipboard.writeText(appUrl)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }
  const share = () => navigator.share?.({ title: 'LePtiGrp', text: 'Rejoins-moi sur LePtiGrp !', url: appUrl }).catch(() => {})

  return (
    <Screen header={<>
      <BackButton to="/" />
      <h1>Paramètres</h1><span className="icon-btn" />
    </>}>
      {profile && (
        <button className="card me-card wide-btn" onClick={() => setEditProfile(true)}>
          <Avatar name={profile.display_name} url={profile.avatar_url} size={52} />
          <div className="me-info">
            <div className="me-name">{profile.display_name}</div>
            <div className="muted small">{session?.user.email}</div>
          </div>
          <span className="link">Modifier</span>
        </button>
      )}

      <div className="section-title">Notifications</div>
      <div className="card">
        {push === 'needs-install' ? <p className="muted small help">Sur iPhone, installe d'abord l'appli sur l'écran d'accueil (voir plus bas), puis ouvre-la depuis l'icône pour activer les notifications.</p>
          : push === 'unsupported' ? <p className="muted small help">Ce navigateur ne gère pas les notifications.</p>
          : push === 'denied' ? <DeniedGuide onCheck={recheck} />
          : push && <Toggle label="Activer sur cet appareil" checked={push === 'on'} onChange={togglePush} />}
        <p className="muted small help">Le détail (tous les messages, mentions, épinglés) se règle dans chaque conversation.</p>
      </div>

      <div className="section-title">Partager l'appli</div>
      <div className="card">
        <div className="copy-row">
          <input readOnly value={appUrl} onFocus={(e) => e.target.select()} />
          <button className="btn primary" onClick={copy}>{copied ? 'Copié !' : 'Copier'}</button>
          {'share' in navigator && <button className="icon-btn" onClick={share} aria-label="Partager"><IconShare /></button>}
        </div>
        <p className="muted small help">
          <b>iPhone</b> : ouvrir le lien dans Safari, Partager, « Sur l'écran d'accueil ».<br />
          <b>Android</b> : ouvrir le lien dans Chrome, menu ⋮, « Installer l'application ».
        </p>
      </div>

      <div className="section-title">Compte</div>
      <div className="card list-card">
        <button className="settings-row" onClick={() => setAccount('email')}>Changer d'email</button>
        <button className="settings-row" onClick={() => setAccount('password')}>Changer de mot de passe</button>
      </div>

      <DevSection />

      <div className="section-title">Chiffrement de bout en bout</div>
      <Encryption />

      <button className="settings-row danger" onClick={async () => (await ask('Se déconnecter ?')) && supabase.auth.signOut()}>
        Se déconnecter
      </button>

      <AdminFeedback />

      <button className="settings-row danger delete-account" onClick={() => setDeleting(true)}>Supprimer mon compte</button>
      <DeleteAccount open={deleting} onClose={() => setDeleting(false)} />

      <AccountForm kind={account} onClose={() => setAccount(null)} />
      <ProfileEditor open={editProfile} onClose={() => setEditProfile(false)} />
    </Screen>
  )
}

/** Le navigateur ne peut plus redemander l'autorisation : on explique où la rendre, selon le téléphone */
function DeniedGuide({ onCheck }: { onCheck: () => void }) {
  const steps = isIos()
    ? ['Ouvre l\'app Réglages de l\'iPhone', 'Notifications', 'LePtiGrp', 'Active « Autoriser les notifications »']
    : /android/i.test(navigator.userAgent)
      ? ['Appui long sur l\'icône LePtiGrp', 'Infos sur l\'appli (ⓘ)', 'Notifications', 'Active « Toutes les notifications »']
      : ['Clique sur le cadenas à gauche de l\'adresse du site', 'Notifications', 'Autoriser']
  return (
    <div className="denied-guide">
      <p><b>Les notifications sont bloquées sur ce téléphone.</b> L'appli ne peut plus te les redemander, il faut les autoriser dans les réglages :</p>
      <ol>{steps.map((s) => <li key={s}>{s}</li>)}</ol>
      <p className="muted small">Reviens ensuite dans l'appli : elles s'activeront toutes seules.</p>
      <button className="btn" onClick={onCheck}>Vérifier</button>
    </div>
  )
}

/** Suppression définitive du compte : il faut taper SUPPRIMER */
function DeleteAccount({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { session } = useAuth()
  const [word, setWord] = useState('')
  const [busy, setBusy] = useState(false)
  const run = async () => {
    setBusy(true)
    // photos de profil (le dossier avatars/<mon id>), puis le compte et tout ce qui en dépend
    const uid = session!.user.id
    const { data: files } = await supabase.storage.from('avatars').list(uid)
    if (files?.length) await supabase.storage.from('avatars').remove(files.map((f) => `${uid}/${f.name}`))
    const { error } = await supabase.rpc('delete_my_account')
    if (error) { setBusy(false); return notify(errMsg(error)) }
    await supabase.auth.signOut({ scope: 'local' })
  }
  return (
    <Sheet open={open} onClose={onClose} title="Supprimer mon compte">
      <p className="small">C'est <b>définitif</b> : ton nom, ta photo, tes amis, tes clés de chiffrement et tes outils perso seront effacés, et tu quitteras toutes tes conversations.
        Pour que les autres s'y retrouvent, tes messages, tes dépenses et ce que tu as pris dans les pense-bêtes restent, signés « Compte supprimé ».</p>
      <p className="small">Tape <b>SUPPRIMER</b> pour confirmer :</p>
      <input value={word} onChange={(e) => setWord(e.target.value)} placeholder="SUPPRIMER" autoCapitalize="characters" autoComplete="off" />
      <div className="inline-form">
        <button className="btn" onClick={onClose}>Annuler</button>
        <button className="btn danger-btn wide" disabled={word.trim().toUpperCase() !== 'SUPPRIMER' || busy} onClick={run}>{busy ? 'Suppression…' : 'Supprimer'}</button>
      </div>
    </Sheet>
  )
}

/** Code de sécurité de ce compte + explications */
function Encryption() {
  const id = identity()
  if (!id) return null
  return (
    <div className="card">
      <p className="small">Mon code de sécurité, à comparer avec celui que voient tes amis (réglages d'une conversation) :</p>
      <code className="safety-code">{safetyCode(b64(id.signPk), b64(id.boxPk))}</code>
      <p className="muted small help">Tes messages sont chiffrés sur ton téléphone : ni le serveur ni personne d'autre que les membres d'une conversation ne peut les lire.
        Tes clés sont protégées par ton mot de passe, qui ne quitte jamais ton téléphone : il suffit de te connecter pour tout retrouver.
        <b> Si ton mot de passe est réinitialisé (oubli), tes anciens messages chiffrés seront perdus.</b> Choisis un mot de passe solide.
        Restent visibles par le serveur : qui parle à qui, quand, les mentions, et les outils (pense-bêtes, comptes, sondages), pas encore chiffrés.</p>
    </div>
  )
}
