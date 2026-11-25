import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { Screen } from '../components/Layout'
import { Avatar } from '../components/Avatar'
import { IconBack, IconShare } from '../components/Icons'
import { ProfileEditor } from '../components/ProfileEditor'
import { ask, notify } from '../components/Dialog'
import { Toggle } from '../components/Sheet'
import { pushState, enablePush, disablePush, type PushState } from '../lib/push'
import { errMsg } from '../lib/supabase'

export default function Settings() {
  const { session, profile } = useAuth()
  const [editProfile, setEditProfile] = useState(false)
  const [copied, setCopied] = useState(false)
  const appUrl = window.location.origin
  const [push, setPush] = useState<PushState | null>(null)
  useEffect(() => { pushState().then(setPush) }, [])

  const togglePush = async (on: boolean) => {
    try { await (on ? enablePush() : disablePush()) } catch (e) { notify(errMsg(e)) }
    setPush(await pushState())
  }

  const copy = async () => {
    await navigator.clipboard.writeText(appUrl)
    setCopied(true); setTimeout(() => setCopied(false), 2000)
  }
  const share = () => navigator.share?.({ title: 'LePtiGrp', text: 'Rejoins-moi sur LePtiGrp !', url: appUrl }).catch(() => {})

  return (
    <Screen header={<>
      <Link to="/" className="icon-btn" aria-label="Retour"><IconBack /></Link>
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
          : push === 'denied' ? <p className="muted small help">Notifications bloquées : autorise-les pour LePtiGrp dans les réglages du téléphone.</p>
          : push && <Toggle label="Activer sur cet appareil" checked={push === 'on'} onChange={togglePush} />}
        <p className="muted small help">Le détail (tous les messages, mentions, épinglés) se règle dans chaque conversation.</p>
      </div>

      <div className="section-title">Télécharger l'appli</div>
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

      <button className="settings-row danger" onClick={async () => (await ask('Se déconnecter ?')) && supabase.auth.signOut()}>
        Se déconnecter
      </button>

      <ProfileEditor open={editProfile} onClose={() => setEditProfile(false)} />
    </Screen>
  )
}
