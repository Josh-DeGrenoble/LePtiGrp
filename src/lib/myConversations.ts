import { supabase, type ConvSummary } from './supabase'
import { readCache, writeCache } from './network'

/** Mes conversations (liste, menus de partage) : dernière version en cache, puis rechargée */
export const cachedConversations = () => readCache<ConvSummary[]>('convs', [])

export async function fetchConversations(): Promise<ConvSummary[] | null> {
  const { data, error } = await supabase.rpc('my_conversations')
  if (error || !data) return null
  writeCache('convs', data)
  return data as ConvSummary[]
}
