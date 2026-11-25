import { supabase } from './supabase'

/** Notifications push (Web Push). Sur iPhone : uniquement quand l'appli est installée sur l'écran d'accueil (iOS 16.4+). */
const VAPID = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

export type PushState = 'unsupported' | 'needs-install' | 'denied' | 'on' | 'off'

export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent)
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true

export async function pushState(): Promise<PushState> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window) || !VAPID) {
    return isIos() && !isStandalone() ? 'needs-install' : 'unsupported'
  }
  if (Notification.permission === 'denied') return 'denied'
  const reg = await navigator.serviceWorker.ready
  return (await reg.pushManager.getSubscription()) && Notification.permission === 'granted' ? 'on' : 'off'
}

function keyToBytes(base64: string) {
  const b = atob((base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'))
  return Uint8Array.from(b, (c) => c.charCodeAt(0))
}

async function save(sub: PushSubscription) {
  const { keys } = sub.toJSON() as { keys: { p256dh: string; auth: string } }
  const { error } = await supabase.from('push_subscriptions')
    .upsert({ endpoint: sub.endpoint, p256dh: keys.p256dh, auth: keys.auth }, { onConflict: 'endpoint' })
  if (error) throw error
}

export async function enablePush() {
  const perm = await Notification.requestPermission()
  if (perm === 'denied') throw new Error('denied')
  if (perm !== 'granted') throw new Error('Tu as fermé la demande : réessaie et choisis « Autoriser ».')
  const reg = await navigator.serviceWorker.ready
  const sub = (await reg.pushManager.getSubscription())
    ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(VAPID!) }))
  await save(sub)
}

export async function disablePush() {
  const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription()
  if (!sub) return
  await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
  await sub.unsubscribe()
}

/** Au lancement : ré-enregistre l'abonnement (il peut changer, ou appartenir à un autre compte sur ce téléphone) */
export async function syncPush() {
  if ((await pushState()) !== 'on') return
  const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription()
  if (sub) await save(sub).catch(() => {})
}
