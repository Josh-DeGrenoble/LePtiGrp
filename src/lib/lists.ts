import { supabase, type List } from './supabase'
import { readCache, writeCache } from './network'

/** Pense-bête avec le nombre d'éléments restant à cocher */
export type ListSummary = List & { left: number; total: number }

export const cachedLists = () => readCache<ListSummary[]>('lists', [])

/** Tous mes pense-bêtes (perso + ceux de mes conversations), les plus récents d'abord */
export async function loadLists(): Promise<ListSummary[]> {
  const { data, error } = await supabase.from('lists').select('*, list_items(checked)').order('created_at', { ascending: false })
  if (error) throw error
  const lists = (data as (List & { list_items: { checked: boolean }[] })[]).map(({ list_items, ...l }) => ({
    ...l, total: list_items.length, left: list_items.filter((i) => !i.checked).length,
  }))
  writeCache('lists', lists)
  return lists
}

export async function createList(name: string, conversationId: string | null) {
  const { data, error } = await supabase.from('lists').insert({ name: name.trim(), conversation_id: conversationId }).select().single()
  if (error) throw error
  return data as List
}
