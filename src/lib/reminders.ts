import { supabase, type Reminder } from './supabase'
import { readCache, writeCache } from './network'

/**
 * Rappels perso. Le serveur les envoie en push à l'heure prévue ; en plus, le téléphone les programme lui-même
 * tant que l'appli tourne (même sans réseau). Même `tag` des deux côtés : une seule notification.
 * Un rappel créé hors ligne attend dans une file et part au retour du réseau.
 */
type Local = Pick<Reminder, 'message' | 'remind_at' | 'conversation_id'> & { client_id: string; id?: number }

const KEY = 'reminders'
const QUEUE = 'reminders-queue'
const timers = new Map<string, number>()

export const localReminders = () => readCache<Local[]>(KEY, [])
  .filter((r) => Date.parse(r.remind_at) > Date.now() - 86400e3)

async function show(r: Local) {
  const reg = await navigator.serviceWorker?.ready
  if (!reg || Notification.permission !== 'granted') return
  const tag = `reminder-${r.client_id}`
  if ((await reg.getNotifications({ tag })).length) return  // le push du serveur est déjà arrivé
  await reg.showNotification('⏰ Rappel', { body: r.message, tag, data: { url: r.conversation_id ? `/c/${r.conversation_id}` : '/' }, icon: '/icon-v3-192.png', badge: '/icon-v3-192.png' })
}

/** (Re)programme les minuteries locales des rappels à venir */
function arm(list: Local[]) {
  writeCache(KEY, list)
  for (const t of timers.values()) clearTimeout(t)
  timers.clear()
  for (const r of list) {
    const ms = Date.parse(r.remind_at) - Date.now()
    if (ms > 0 && ms < 2 ** 31 - 1) timers.set(r.client_id, window.setTimeout(() => show(r), ms))
  }
}

/** Envoie les rappels créés hors ligne, puis recharge la liste du serveur */
export async function syncReminders() {
  const queue = readCache<Local[]>(QUEUE, [])
  for (const r of queue) {
    const { error } = await supabase.from('reminders').insert({ message: r.message, remind_at: r.remind_at, conversation_id: r.conversation_id, client_id: r.client_id })
    if (error && error.code !== '23505') break  // 23505 : déjà envoyé
    writeCache(QUEUE, readCache<Local[]>(QUEUE, []).filter((x) => x.client_id !== r.client_id))
  }
  const { data } = await supabase.from('reminders').select('*').is('sent_at', null).order('remind_at')
  if (data) arm([...(data as (Reminder & { client_id: string | null })[]).map((r) => ({ ...r, client_id: r.client_id ?? String(r.id) })),
    ...readCache<Local[]>(QUEUE, [])])
  return localReminders()
}

export async function addReminder(r: Omit<Local, 'client_id'>) {
  const item = { ...r, client_id: crypto.randomUUID() }
  writeCache(QUEUE, [...readCache<Local[]>(QUEUE, []), item])
  arm([...localReminders(), item])  // programmé tout de suite, réseau ou pas
  await syncReminders().catch(() => {})
}

export async function cancelReminder(r: Local) {
  writeCache(QUEUE, readCache<Local[]>(QUEUE, []).filter((x) => x.client_id !== r.client_id))
  arm(localReminders().filter((x) => x.client_id !== r.client_id))
  if (r.id) await supabase.from('reminders').delete().eq('id', r.id)
}

let started = false
export function startReminders() {
  if (!started) { started = true; window.addEventListener('online', () => { syncReminders().catch(() => {}) }) }
  arm(localReminders())
  syncReminders().catch(() => {})
}
export type { Local as LocalReminder }
