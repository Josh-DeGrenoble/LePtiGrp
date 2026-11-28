import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase, type Profile } from './supabase'
import { clearCache } from './network'
import { resetWrites } from './offlineDb'
import { forgetPushDevice } from './push'
import { stopReminders } from './reminders'
import { readCache, writeCache } from './network'

/** Session gardée par Supabase sur le téléphone : lue directement pour afficher l'appli sans attendre
 *  (getSession() attend le renouvellement du jeton par le réseau s'il a expiré, soit à chaque ouverture après 1 h) */
function storedSession(): Session | null {
  try {
    const ref = new URL(import.meta.env.VITE_SUPABASE_URL as string).hostname.split('.')[0]
    const s = JSON.parse(localStorage.getItem(`sb-${ref}-auth-token`) ?? 'null') as Session | null
    return s?.user?.id && s.refresh_token ? s : null
  } catch { return null }
}

/** Déconnexion : on détache d'abord ce téléphone des notifications (3 s max, hors réseau on n'attend pas) */
export async function signOut() {
  await Promise.race([forgetPushDevice().catch(() => {}), new Promise((r) => setTimeout(r, 3000))])
  await supabase.auth.signOut()
}

type AuthCtx = { session: Session | null; profile: Profile | null; loading: boolean; refreshProfile: () => Promise<void> }
const Ctx = createContext<AuthCtx>({ session: null, profile: null, loading: true, refreshProfile: async () => {} })

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(storedSession)
  const [profile, setProfile] = useState<Profile | null>(() => {
    const p = readCache<Profile | null>('profile', null)
    return p && p.id === session?.user.id ? p : null
  })
  // Session déjà sur le téléphone : on affiche tout de suite (le profil et le jeton se mettent à jour derrière)
  const [loading, setLoading] = useState(() => !session)

  const loadProfile = async (uid: string | undefined) => {
    if (!uid) { setProfile(null); return }
    const { data } = await supabase.from('profiles').select('*').eq('id', uid).single()
    if (data) { setProfile(data as Profile); writeCache('profile', data) }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data, error }) => {
      // jeton non renouvelé faute de réseau : on garde la session du téléphone (une vraie déconnexion arrive par SIGNED_OUT)
      if (data.session || !error) setSession(data.session)
      setLoading(false)
      if (data.session) loadProfile(data.session.user.id)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === 'SIGNED_OUT') { clearCache(); resetWrites(); stopReminders() }
      if (event === 'INITIAL_SESSION') return  // déjà traité par getSession() ci-dessus
      setSession(s)
      setTimeout(() => loadProfile(s?.user.id), 0)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  return (
    <Ctx.Provider value={{ session, profile, loading, refreshProfile: () => loadProfile(session?.user.id) }}>
      {children}
    </Ctx.Provider>
  )
}

export const useAuth = () => useContext(Ctx)
export const useMe = () => useContext(Ctx).session?.user.id ?? ''
