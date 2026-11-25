import { useRef, useState } from 'react'
import { supabase, errMsg } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { PRESET_AVATARS, uploadAvatar } from '../lib/avatars'
import { Avatar } from './Avatar'
import { ImageCropper } from './ImageCropper'
import { Sheet } from './Sheet'
import { notify } from './Dialog'

/** Fenêtre "Mon profil" : nom, photo de la galerie (recadrée) ou avatar prédéfini */
export function ProfileEditor({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile, refreshProfile } = useAuth()
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  if (!profile) return null

  const save = async (patch: { avatar_url?: string | null; display_name?: string }) => {
    const { error } = await supabase.from('profiles').update(patch).eq('id', profile.id)
    if (error) notify(errMsg(error))
    await refreshProfile()
  }

  const upload = async (blob: Blob) => {
    setBusy(true)
    try { await save({ avatar_url: await uploadAvatar(profile.id, blob) }); setFile(null) }
    catch (e) { notify(`Envoi impossible : ${errMsg(e)}`) }
    finally { setBusy(false) }
  }

  return (
    <Sheet open={open} onClose={() => { setFile(null); onClose() }} title="Mon profil">
      {file ? (
        busy ? <p className="center muted">Envoi…</p> : <ImageCropper file={file} onCancel={() => setFile(null)} onDone={upload} />
      ) : <>
        <div className="profile-head">
          <Avatar name={profile.display_name} url={profile.avatar_url} size={88} />
          <button className="btn" onClick={() => input.current?.click()}>Choisir une photo</button>
          <input ref={input} type="file" accept="image/*" hidden onChange={(e) => { setFile(e.target.files?.[0] ?? null); e.target.value = '' }} />
        </div>
        <input defaultValue={profile.display_name} maxLength={30} placeholder="Ton nom"
          onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== profile.display_name) save({ display_name: v }) }} />
        <div className="sheet-section">Ou choisis un avatar</div>
        <div className="preset-grid">
          {PRESET_AVATARS.map((a) => (
            <button key={a} className={`preset${profile.avatar_url === a ? ' on' : ''}`} onClick={() => save({ avatar_url: a })}>
              <Avatar name="" url={a} size={52} />
            </button>
          ))}
          <button className={`preset${!profile.avatar_url ? ' on' : ''}`} onClick={() => save({ avatar_url: null })} aria-label="Initiales">
            <Avatar name={profile.display_name} size={52} />
          </button>
        </div>
      </>}
    </Sheet>
  )
}
