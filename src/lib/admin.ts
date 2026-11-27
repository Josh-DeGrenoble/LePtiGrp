import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { useMe } from './auth'
import { readCache, writeCache } from './network'

/** Suis-je admin de l'appli (table app_admins) ? */
export function useIsAdmin() {
  const me = useMe()
  const [admin, setAdmin] = useState(() => readCache<boolean>(`admin:${me}`, false))
  useEffect(() => {
    if (!me) return
    supabase.from('app_admins').select('user_id').eq('user_id', me).maybeSingle().then(({ data, error }) => {
      if (error) return
      setAdmin(!!data); writeCache(`admin:${me}`, !!data)
    })
  }, [me])
  return admin
}
