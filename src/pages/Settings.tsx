import { BackButton } from '../components/BackButton'
import { hasPassword } from './E2EESetup'
import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth, signOut } from '../lib/auth'
import { Screen } from '../components/Layout'
import { Avatar } from '../components/Avatar'
import { IconBell, IconSend, IconLogout, IconLock, IconMail, IconNext, IconShield, IconCrown, IconCheck } from '../components/Icons'
import { SGroup, SRow } from '../components/SettingsRow'
import { ProfileEditor } from '../components/ProfileEditor'
import { DevSection } from '../components/Feedback'
import { AccountForm } from '../components/AccountForms'
import { ask, notify } from '../components/Dialog'
import { Sheet } from '../components/Sheet'
import { ToolPrefsGrid, ALL_TOOLS } from '../components/NotifToggles'
import type { ToolKey } from '../lib/supabase'
import { pushState, enablePush, disablePush, isIos, testPush, type PushState } from '../lib/push'
import { useOnResume } from '../lib/network'
import { errMsg } from '../lib/supabase'
import { identity } from '../lib/e2ee'
import { useIsAdmin } from '../lib/admin'
import { TEXT_SCALES, getTextScale, setTextScale } from '../lib/textScale'
import { ACCENTS, appColor, getAccent, setAccent } from '../lib/accent'
import { Link } from 'react-router-dom'

/** Réglages par défaut de l'activité des outils (enregistrés sur le profil) */
function ActivityDefaults() {
  const { profile, refreshProfile } = useAuth()
  const [show, setShow] = useState<ToolKey[]>(profile?.show_tools_default ?? [])
  const [notif, setNotif] = useState<ToolKey[]>(profile?.notify_tools_default ?? ALL_TOOLS)
  useEffect(() => { setShow(profile?.show_tools_default ?? []); setNotif(profile?.notify_tools_default ?? ALL_TOOLS) }, [profile])
  const save = async (p: { show?: ToolKey[]; notify?: ToolKey[] }) => {
    if (p.show) setShow(p.show)
    if (p.notify) setNotif(p.notify)
    const { error } = await supabase.from('profiles').update({ ...(p.show && { show_tools_default: p.show }), ...(p.notify && { notify_tools_default: p.notify }) }).eq('id', profile!.id)
    if (error) notify(errMsg(error))
    refreshProfile()
  }
  return <SGroup title="Modifs des outils" note="Tes préférences par défaut. Chaque conversation peut avoir les siennes.">
    <ToolPrefsGrid show={show} notify={notif} onChange={save} />
  </SGroup>
}

export default function Settings() {
  const { session, profile } = useAuth()
  const [editProfile, setEditProfile] = useState(false)
  const isAdmin = useIsAdmin()
  const [account, setAccount] = useState<'email' | 'password' | null>(null)
  const [deleting, setDeleting] = useState(false)
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


  return (
    <Screen header={<>
      <BackButton to="/" />
      <h1>Paramètres</h1>{isAdmin ? <Link to="/admin" className="icon-btn" aria-label="Admin"><IconCrown size={22} /></Link> : <span className="icon-btn" />}
    </>}>
      <div className="settings-page">
        {profile && (
          <button className="profile-card" onClick={() => setEditProfile(true)}>
            <Avatar name={profile.display_name} url={profile.avatar_url} size={56} />
            <div className="me-info">
              <div className="me-name">{profile.display_name}</div>
              <div className="muted small">Modifier mon nom et ma photo</div>
            </div>
            <span className="srow-chev"><IconNext /></span>
          </button>
        )}

        {/* Ordre : compte et sécurité, notifications, outils, apparence, puis aide/dev et sortie */}
        <SGroup title="Compte">
          {session && hasPassword(session.user) ? <>
            <SRow icon={<IconMail size={18} />} label="Email" sub={session.user.email} onClick={() => setAccount('email')} />
            <SRow icon={<IconLock />} label="Mot de passe" onClick={() => setAccount('password')} />
          </> : <>
            <SRow icon={<IconMail size={18} />} label="Compte Google" sub={session?.user.email} />
            <SRow icon={<IconLock />} label="Mot de passe de chiffrement" onClick={() => setAccount('password')} />
          </>}
        </SGroup>

        <Encryption />

        <SGroup title="Notifications" note={push === 'on' || push === 'off' ? 'Le détail (tous les messages, mentions, épinglés) se règle dans chaque conversation.' : undefined}>
          {push === 'needs-install' ? <p className="muted small help">Sur iPhone, installe d'abord l'appli sur l'écran d'accueil (Safari, Partager, « Sur l'écran d'accueil »), puis ouvre-la depuis l'icône.</p>
            : push === 'unsupported' ? <p className="muted small help">Ce navigateur ne gère pas les notifications.</p>
            : push === 'denied' ? <DeniedGuide onCheck={recheck} />
            : <label className="srow toggle-row">
                <span className="srow-icon"><IconBell size={18} /></span>
                <span className="srow-text">Sur cet appareil</span>
                <input type="checkbox" checked={push === 'on'} disabled={!push} onChange={(e) => togglePush(e.target.checked)} />
                <span className="toggle" />
              </label>}
          {push === 'on' && <SRow icon={<IconSend size={16} />} label="Envoyer une notification de test" chevron={false}
            onClick={async () => notify(await testPush())} />}
        </SGroup>

        {profile && <ActivityDefaults />}

        <AccentColor />

        <TextSize />

        <DevSection />

        <SGroup>
          <SRow icon={<IconLogout />} label="Se déconnecter" chevron={false}
            onClick={async () => { if (await ask('Se déconnecter ?')) signOut() }} />
        </SGroup>

        <button className="delete-link" onClick={() => setDeleting(true)}>Supprimer mon compte</button>
      </div>
      <DeleteAccount open={deleting} onClose={() => setDeleting(false)} />

      <AccountForm kind={account} onClose={() => setAccount(null)} />
      <ProfileEditor open={editProfile} onClose={() => setEditProfile(false)} />
    </Screen>
  )
}

/** Couleur principale de l'appli (sur cet appareil), parmi celles des tags */
function AccentColor() {
  const [v, setV] = useState(getAccent)
  return <SGroup title="Couleur de l'appli" note="Boutons, bulles de tes messages, liens… Sur cet appareil.">
    <div className="accent-chips">
      {ACCENTS.map((c) => (
        <button key={c} className={`accent-dot${v === c ? ' on' : ''}`} style={{ background: appColor(c) }} aria-label={`Couleur ${c}`} aria-pressed={v === c}
          onClick={() => { setV(c); setAccent(c) }}>{v === c && <IconCheck size={18} />}</button>
      ))}
    </div>
  </SGroup>
}

/** Taille du texte des conversations (sur cet appareil) */
function TextSize() {
  const [v, setV] = useState(getTextScale)
  return <SGroup title="Mode Lucas" note="Pour les messages et la liste des conversations, sur cet appareil.">
    <div className="ts-chips">
      {TEXT_SCALES.map((x) => (
        <button key={x} className={`pref-chip${v === x ? ' on' : ''}`} onClick={() => { setV(x); setTextScale(x) }}>
          {x === 1 ? 'Normal' : `×${String(x).replace('.', ',')}`}
        </button>
      ))}
    </div>
  </SGroup>
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

/** État du chiffrement + explications */
function Encryption() {
  const id = identity()
  if (!id) return null
  return (
    <SGroup title="Chiffrement" note={<details>
      <summary>Comment ça marche ?</summary>
      <p>Tes messages sont chiffrés sur ton téléphone : ni le serveur ni personne d'autre que les membres d'une conversation ne peut les lire.
        Tes clés sont protégées par ton mot de passe, qui ne quitte jamais ton téléphone.</p>
      <p><b>Si ton mot de passe est réinitialisé (oubli), tes anciens messages chiffrés seront perdus.</b></p>
      <p>Restent visibles par le serveur : qui parle à qui, quand, les mentions, et les outils (pense-bêtes, comptes, sondages).</p>
    </details>}>
      <div className="srow">
        <span className="srow-icon"><IconShield /></span>
        <span className="srow-text">Messages chiffrés de bout en bout<small>Actif sur ce téléphone</small></span>
      </div>
    </SGroup>
  )
}
