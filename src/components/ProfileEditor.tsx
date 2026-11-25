import { supabase, errMsg } from '../lib/supabase'
import { useAuth } from '../lib/auth'
import { AvatarChooser } from './AvatarChooser'
import { Sheet } from './Sheet'
import { notify } from './Dialog'

/** Fenêtre "Mon profil" : photo et nom */
export function ProfileEditor({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { profile, refreshProfile } = useAuth()
  if (!profile) return null

  const save = async (patch: { avatar_url?: string | null; display_name?: string }) => {
    const { error } = await supabase.from('profiles').update(patch).eq('id', profile.id)
    if (error) notify(errMsg(error))
    await refreshProfile()
  }

  return (
    <Sheet open={open} onClose={onClose} title="Mon profil">
      <AvatarChooser name={profile.display_name} value={profile.avatar_url} onChange={(url) => save({ avatar_url: url })}>
        <input defaultValue={profile.display_name} maxLength={30} placeholder="Ton nom"
          onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== profile.display_name) save({ display_name: v }) }} />
      </AvatarChooser>
    </Sheet>
  )
}
