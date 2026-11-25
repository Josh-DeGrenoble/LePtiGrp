import { supabase } from './supabase'

const EMOJIS = ['🦊', '🐼', '🐸', '🦁', '🐙', '🦄', '🐧', '🐨', '🦉', '🐢', '🐝', '🦖', '👾', '🤖', '👻', '🌵', '🍕', '🎸', '🚀', '⚡']
const BGS = ['#fde68a', '#bbf7d0', '#bfdbfe', '#fbcfe8', '#ddd6fe', '#fed7aa', '#a5f3fc', '#fecaca']
export const PRESET_AVATARS = EMOJIS.map((e, i) => `emoji:${e}:${BGS[i % BGS.length]}`)

/** Envoie une image recadrée dans Storage et renvoie son URL publique */
export async function uploadAvatar(uid: string, blob: Blob) {
  const path = `${uid}/${Date.now()}.jpg`
  const { error } = await supabase.storage.from('avatars').upload(path, blob, { contentType: 'image/jpeg' })
  if (error) throw error
  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl
}
