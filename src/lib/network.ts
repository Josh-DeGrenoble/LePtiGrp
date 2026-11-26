import { useEffect, useState, useSyncExternalStore } from 'react'
import { supabase, type Message } from './supabase'
import { encryptMessage, forgetDevice } from './e2ee'
import type { PhotoRef } from './crypto/core'

// ---------- État de la connexion ----------

const onlineSubscribe = (cb: () => void) => {
  window.addEventListener('online', cb); window.addEventListener('offline', cb)
  return () => { window.removeEventListener('online', cb); window.removeEventListener('offline', cb) }
}
export const useOnline = () => useSyncExternalStore(onlineSubscribe, () => navigator.onLine)

/** Appelle `fn` au retour du réseau et quand l'appli revient au premier plan (pour rattraper ce qui a été manqué) */
export function useOnResume(fn: () => void) {
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') fn() }
    window.addEventListener('online', fn)
    document.addEventListener('visibilitychange', onVisible)
    return () => { window.removeEventListener('online', fn); document.removeEventListener('visibilitychange', onVisible) }
  }, [fn])
}

// ---------- Cache local (affichage hors-ligne) ----------

export function readCache<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(`cache:${key}`); return v ? (JSON.parse(v) as T) : fallback } catch { return fallback }
}
export function writeCache(key: string, value: unknown) {
  try { localStorage.setItem(`cache:${key}`, JSON.stringify(value)) } catch { /* stockage plein ou bloqué */ }
}

// ---------- File d'attente des messages (envoi hors-ligne) ----------

export type Pending = Pick<Message, 'conversation_id' | 'author_id' | 'mentions' | 'mention_all' | 'created_at'>
  & { content: string; client_id: string; failed?: string; photo?: PhotoRef }

const KEY = 'outbox'
const listeners = new Set<() => void>()
let outbox: Pending[] = readCache<Pending[]>(KEY, [])
let flushing = false

function set(next: Pending[]) { outbox = next; writeCache(KEY, next); listeners.forEach((l) => l()) }

export function usePending(convId: string) {
  const [, force] = useState(0)
  useEffect(() => { const l = () => force((n) => n + 1); listeners.add(l); return () => { listeners.delete(l) } }, [])
  return outbox.filter((p) => p.conversation_id === convId)
}

export function queueMessage(m: Omit<Pending, 'client_id' | 'created_at'> & { client_id?: string }) {
  set([...outbox, { ...m, client_id: m.client_id ?? crypto.randomUUID(), created_at: new Date().toISOString() }])
  flushOutbox()
}

export function dropPending(clientId: string) { set(outbox.filter((p) => p.client_id !== clientId)) }
export function retryPending(clientId: string) {
  set(outbox.map((p) => (p.client_id === clientId ? { ...p, failed: undefined } : p))); flushOutbox()
}

/** Envoie les messages en attente, dans l'ordre. Sans réseau, on garde tout pour plus tard. */
export async function flushOutbox() {
  if (flushing || !navigator.onLine) return
  flushing = true
  try {
    for (const p of outbox.filter((x) => !x.failed)) {
      const { failed: _f, created_at: _c, photo, ...row } = p
      // Chiffré juste avant l'envoi, avec la clé à jour de la conversation
      let error: { message: string } | null
      try {
        const enc = await encryptMessage(p)
        ;({ error } = await supabase.from('messages').upsert({ ...row, ...enc, content: null, has_media: !!photo }, { onConflict: 'client_id', ignoreDuplicates: true }))
      } catch (e) {
        error = { message: (e as Error)?.message ?? String(e) }
      }
      if (!error) { set(outbox.filter((x) => x.client_id !== p.client_id)); continue }
      // Erreur réseau : on réessaiera ; erreur refusée par le serveur (droits…) : on la signale
      if (!navigator.onLine || /fetch|network|Failed/i.test(error.message)) break
      set(outbox.map((x) => (x.client_id === p.client_id ? { ...x, failed: error.message } : x)))
    }
  } finally { flushing = false }
}

/** À lancer une fois au démarrage : renvoi au retour du réseau + toutes les 20 s s'il reste des messages */
let started = false
export function startOutbox() {
  if (started) return flushOutbox()
  started = true
  window.addEventListener('online', flushOutbox)
  setInterval(() => { if (outbox.some((p) => !p.failed)) flushOutbox() }, 20000)
  flushOutbox()
}

/** À la déconnexion : on efface les données en cache (un autre compte peut se connecter sur ce téléphone) */
export function clearCache() {
  try { Object.keys(localStorage).filter((k) => k.startsWith('cache:')).forEach((k) => localStorage.removeItem(k)) } catch { /* rien */ }
  outbox = []
  forgetDevice()
}
