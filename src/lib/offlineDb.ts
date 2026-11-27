import { supabase } from './supabase'
import { readCache, writeCache } from './network'

/**
 * Écritures hors ligne (outils perso : pense-bêtes, comptes, calendrier).
 * Sans réseau, chaque écriture est mise en file (localStorage) et rejouée dans l'ordre au retour du réseau.
 * Les lignes à id auto (list_items, expenses) reçoivent un id local négatif, remplacé par le vrai au rejeu.
 */
type Val = string | number | boolean | null
export type WriteOp = {
  table: string
  op: 'insert' | 'update' | 'delete' | 'upsert'
  values?: Record<string, unknown>
  match?: Record<string, Val>
  onConflict?: string
  ignoreDuplicates?: boolean
  temp?: number  // id local de la ligne insérée (tables à id auto)
}
type Result = { error: { message: string } | null; data?: Record<string, unknown> | null; queued?: boolean }

const KEY = 'db-outbox'
const IDS = 'db-ids'
let queue: WriteOp[] = readCache<WriteOp[]>(KEY, [])
let ids: Record<string, number> = readCache<Record<string, number>>(IDS, {})
let flushing: Promise<void> | null = null
const save = () => { writeCache(KEY, queue); writeCache(IDS, ids) }

const isNetwork = (m: string) => /fetch|network|Failed|Load failed|timeout/i.test(m)
/** id local → vrai id, une fois la ligne enregistrée */
const real = (v: unknown) => (typeof v === 'number' && v < 0 && ids[v] !== undefined ? ids[v] : v)
const sub = (o?: Record<string, unknown>) => o && Object.fromEntries(Object.entries(o).map(([k, v]) => [k, real(v)]))

async function exec(w: WriteOp): Promise<Result> {
  const t = supabase.from(w.table)
  const values = sub(w.values)
  const filter = <Q extends { eq: (c: string, v: Val) => Q; is: (c: string, v: null) => Q }>(q: Q) => {
    for (const [k, v] of Object.entries(sub(w.match) ?? {})) q = v === null ? q.is(k, null) : q.eq(k, v as Val)
    return q
  }
  const r = w.op === 'insert' ? await t.insert(values!).select().single()
    : w.op === 'upsert' ? await t.upsert(values!, { onConflict: w.onConflict, ignoreDuplicates: w.ignoreDuplicates })
    : w.op === 'update' ? await filter(t.update(values!))
    : await filter(t.delete())
  if (!r.error && w.temp && r.data) { ids[w.temp] = (r.data as { id: number }).id; save() }
  return { error: r.error, data: (r as { data?: Record<string, unknown> | null }).data ?? null }
}

/** Écrit tout de suite, ou met en file sans réseau. `queued` : l'écriture partira plus tard. */
export async function dbWrite(w: WriteOp): Promise<Result> {
  if (!navigator.onLine || queue.length) { queue.push(w); save(); flushWrites(); return { error: null, queued: true } }
  try {
    const r = await exec(w)
    if (r.error && isNetwork(r.error.message)) { queue.push(w); save(); return { error: null, queued: true } }
    return r
  } catch {
    queue.push(w); save(); return { error: null, queued: true }
  }
}

/** Rejoue la file, dans l'ordre. À attendre avant de recharger depuis le serveur. */
export function flushWrites(): Promise<void> {
  if (flushing) return flushing
  if (!queue.length || !navigator.onLine) return Promise.resolve()
  flushing = (async () => {
    while (queue.length && navigator.onLine) {
      let r: Result
      try { r = await exec(queue[0]) } catch { break }
      if (r.error && isNetwork(r.error.message)) break
      if (r.error) console.warn('Écriture hors ligne refusée', queue[0], r.error.message)
      queue.shift(); save()
    }
  })().finally(() => { flushing = null })
  return flushing
}

export const pendingWrites = () => queue.length
/** À la déconnexion : les écritures en attente de ce compte ne doivent pas partir sous le compte suivant */
export function resetWrites() { queue = []; ids = {}; save() }
export const tempId = () => -Date.now() - Math.floor(Math.random() * 1000)

window.addEventListener('online', () => { flushWrites() })
flushWrites()
