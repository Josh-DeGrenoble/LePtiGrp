import { useRef, useState, type ReactNode } from 'react'
import { errMsg } from '../lib/supabase'
import { useMe } from '../lib/auth'
import { PRESET_AVATARS, uploadAvatar } from '../lib/avatars'
import { Avatar } from './Avatar'
import { ImageCropper } from './ImageCropper'
import { notify } from './Dialog'

/** Choix d'une image : photo de la galerie (recadrée) ou avatar prédéfini. Sert au profil et aux groupes. */
export function AvatarChooser({ name, value, group, onChange, children }: {
  name: string; value: string | null; group?: boolean; onChange: (url: string | null) => void | Promise<void>; children?: ReactNode
}) {
  const me = useMe()
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)

  const upload = async (blob: Blob) => {
    setBusy(true)
    try { await onChange(await uploadAvatar(me, blob)); setFile(null) }
    catch (e) { notify(`Envoi impossible : ${errMsg(e)}`) }
    finally { setBusy(false) }
  }

  if (file) return busy ? <p className="center muted">Envoi…</p> : <ImageCropper file={file} onCancel={() => setFile(null)} onDone={upload} />

  return <>
    <div className="profile-head">
      <Avatar name={name} url={value} size={88} group={group} />
      <button className="btn" onClick={() => input.current?.click()}>Choisir une photo</button>
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => { setFile(e.target.files?.[0] ?? null); e.target.value = '' }} />
    </div>
    {children}
    <div className="sheet-section">Ou choisis un avatar</div>
    <div className="preset-grid">
      {PRESET_AVATARS.map((a) => (
        <button key={a} className={`preset${value === a ? ' on' : ''}`} onClick={() => onChange(a)}>
          <Avatar name="" url={a} size={52} />
        </button>
      ))}
      <button className={`preset${!value ? ' on' : ''}`} onClick={() => onChange(null)} aria-label="Initiales">
        <Avatar name={name} size={52} group={group} />
      </button>
    </div>
  </>
}
