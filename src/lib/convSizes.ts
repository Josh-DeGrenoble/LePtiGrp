import { useEffect, useState } from 'react'
import { supabase } from './supabase'
import { readCache, writeCache } from './network'

/** Nombre de membres de chacune de mes convs (avatar rond à 2, carré arrondi au-delà) */
export function useConvSizes() {
  const [sizes, setSizes] = useState<Record<string, number>>(() => readCache('conv-sizes', {}))
  useEffect(() => {
    supabase.rpc('conv_sizes').then(({ data }) => {
      if (!data) return
      const map = Object.fromEntries((data as { id: string; members: number }[]).map((r) => [r.id, r.members]))
      setSizes(map); writeCache('conv-sizes', map)
    })
  }, [])
  return sizes
}

/** Avatar carré si la conv compte plus de 2 personnes (si le nombre est inconnu : selon qu'elle est un groupe) */
export const isCrowd = (sizes: Record<string, number>, c: { id: string; is_group: boolean }) =>
  sizes[c.id] !== undefined ? sizes[c.id] > 2 : c.is_group
