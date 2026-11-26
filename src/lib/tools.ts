import { useEffect, useState } from 'react'
import { supabase, type Claim, type Profile, type Shared } from './supabase'
import { readCache, writeCache } from './network'

/** Les outils du menu ▽ : même logique de partage, de liste et de création */
export type ToolKind = 'notes' | 'accounts' | 'polls' | 'calendar'

type Row = Shared & Record<string, unknown>

/** Nombre au début de la quantité demandée (« 3 », « 2,5 kg »), sinon null */
export const wanted = (q: string | null) => { const n = parseFloat((q ?? '').replace(',', '.')); return n > 0 ? n : null }

/**
 * État d'un élément de pense-bête selon les prises : fait quand quelqu'un s'en occupe sans quantité,
 * ou quand la somme des prises atteint la quantité demandée.
 */
export function itemStatus(quantity: string | null, claims: Claim[] = [], kind = 'take') {
  // « restant » (ex. 25 % de shampoing) : pas de quantité à se partager, une coche suffit
  const want = kind === 'take' ? wanted(quantity) : null
  const got = claims.reduce((s, c) => s + Number(c.qty ?? 0), 0)
  const done = claims.length > 0 && (want === null || got >= want || claims.some((c) => c.qty === null))
  return { want, got, done, left: want !== null ? Math.max(0, want - got) : null }
}

/** « Sam. 5 déc. à 20h » */
export function eventWhen(day: string, at: string | null, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }) {
  const s = new Date(`${day}T12:00:00`).toLocaleDateString('fr-FR', opts)
  return s.charAt(0).toUpperCase() + s.slice(1) + (at ? ` à ${at.slice(0, 5).replace(':', 'h').replace(/h00$/, 'h')}` : '')
}

export const euro = (n: number) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })

export const TOOLS: Record<ToolKind, {
  table: string; label: string; newTitle: string; placeholder: string; field: 'name' | 'question' | 'title'; select: string; summary: (r: Row) => string
}> = {
  notes: {
    table: 'lists', label: 'Pense-bête', newTitle: 'Nouveau pense-bête', placeholder: 'Nom du pense-bête', field: 'name',
    select: '*, list_items(quantity, qty_kind, list_claims(qty))',
    summary: (r) => {
      const items = r.list_items as { quantity: string | null; qty_kind?: string; list_claims: Claim[] }[]
      const left = items.filter((i) => !itemStatus(i.quantity, i.list_claims, i.qty_kind).done).length
      return !items.length ? 'Vide' : left ? `${left} à faire` : 'Tout est coché'
    },
  },
  accounts: {
    table: 'ledgers', label: 'Comptes', newTitle: 'Nouveaux comptes', placeholder: 'Nom (ex. : Week-end à Annecy)', field: 'name',
    select: '*, expenses(amount)',
    summary: (r) => {
      const total = (r.expenses as { amount: number }[]).reduce((s, e) => s + Number(e.amount), 0)
      return total ? `${euro(total)} au total` : 'Aucune dépense'
    },
  },
  calendar: {
    table: 'events', label: 'Calendrier', newTitle: 'Nouvel événement', placeholder: "Nom (ex. : Resto d'anniv)", field: 'title',
    select: '*, event_replies(going)',
    summary: (r) => {
      const yes = (r.event_replies as { going: boolean }[]).filter((x) => x.going).length
      return eventWhen(String(r.day), r.at_time as string | null) + (yes ? ` · ${yes} ✓` : '')
    },
  },
  polls: {
    table: 'polls', label: 'Sondage', newTitle: 'Nouveau sondage', placeholder: 'Ta question', field: 'question',
    select: '*, poll_votes(user_id)',
    summary: (r) => {
      const n = new Set((r.poll_votes as { user_id: string }[]).map((v) => v.user_id)).size
      return n ? `${n} votant${n > 1 ? 's' : ''}` : 'Aucun vote'
    },
  },
}

/** Élément d'un outil, résumé pour les listes et le menu */
export type ToolItem = Shared & { title: string; summary: string }

export const cachedTools = (k: ToolKind) => readCache<ToolItem[]>(`tools:${k}`, [])

export async function loadTools(k: ToolKind): Promise<ToolItem[]> {
  const t = TOOLS[k]
  const { data, error } = await supabase.from(t.table).select(t.select).order('created_at', { ascending: false })
  if (error) throw error
  const items = (data as unknown as Row[]).map((r) => ({
    id: r.id, owner_id: r.owner_id, conversation_id: r.conversation_id, participants: r.participants, created_at: r.created_at,
    title: String(r[t.field]), summary: t.summary(r),
  }))
  writeCache(`tools:${k}`, items)
  return items
}

/** Choix du partage à la création */
export type Share = { mode: 'me' | 'conv' | 'free'; conv: string | null; ids: string[] }

export async function createTool(k: ToolKind, fields: Record<string, unknown>, share: Share, me: string) {
  const { data, error } = await supabase.from(TOOLS[k].table).insert({
    ...fields,
    conversation_id: share.mode === 'conv' ? share.conv : null,
    participants: share.mode === 'free' ? [me, ...share.ids] : [me],
  }).select().single()
  if (error) throw error
  return data as Shared
}

/** Les personnes qui partagent un outil : membres de la conv, ou participants */
export function usePeople(item: Pick<Shared, 'conversation_id' | 'participants'> | null) {
  const key = item ? item.conversation_id ?? item.participants.join() : ''
  const [people, setPeople] = useState<Profile[]>(() => readCache<Profile[]>(`people:${key}`, []))
  useEffect(() => {
    if (!item) return
    const q = item.conversation_id
      ? supabase.from('members').select('profiles(*)').eq('conversation_id', item.conversation_id)
        .then(({ data }) => (data as unknown as { profiles: Profile }[] | null)?.map((m) => m.profiles).filter(Boolean))
      : supabase.from('profiles').select('*').in('id', item.participants).then(({ data }) => data as Profile[] | null)
    q.then((p) => { if (p) { setPeople(p); writeCache(`people:${key}`, p) } })
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return people
}

/** Profils cités (dépenses, prises) mais plus parmi les gens de l'outil : comptes supprimés, anciens membres */
export function useGhosts(people: Profile[], ids: string[]) {
  const missing = [...new Set(ids)].filter((id) => !people.some((p) => p.id === id)).sort().join()
  const [ghosts, setGhosts] = useState<Profile[]>([])
  useEffect(() => {
    if (!missing || !people.length) return setGhosts([])
    supabase.from('profiles').select('*').in('id', missing.split(',')).then(({ data }) => setGhosts((data as Profile[] | null) ?? []))
  }, [missing]) // eslint-disable-line react-hooks/exhaustive-deps
  return ghosts
}
