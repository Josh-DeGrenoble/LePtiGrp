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
  // via une fonction : l'abonnement repasse à ce compte même s'il était à un autre compte sur ce téléphone
  const { error } = await supabase.rpc('save_push_subscription', { endpoint: sub.endpoint, p256dh: keys.p256dh, auth: keys.auth })
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

/** Bouton « Tester » : le serveur envoie une notification à ce compte et dit ce qui coince */
export async function testPush(): Promise<string> {
  const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription()
  if (!sub) return "Ce téléphone n'est pas abonné : coupe puis réactive l'interrupteur."
  await save(sub)
  const { data, error } = await supabase.functions.invoke('push', { body: { event: 'test' } })
  if (error) return `Le serveur ne répond pas (${error.message}). La fonction « push » est-elle déployée ?`
  const r = data as { subs: number; sent: number; errors: string[]; vapid: boolean }
  if (!r.vapid) return 'Il manque les clés VAPID dans les secrets de la fonction « push ».'
  if (!r.subs) return "Aucun appareil enregistré pour ce compte : coupe puis réactive l'interrupteur."
  if (r.errors.some((e) => e.startsWith('403') || e.startsWith('401'))) return 'Clés VAPID différentes entre l\'appli (Vercel) et la fonction « push » : vérifie VITE_VAPID_PUBLIC_KEY et VAPID_PUBLIC_KEY.'
  if (r.errors.length) return `Envoi refusé : ${r.errors[0]}`
  return `Notification envoyée à ${r.sent} appareil${r.sent > 1 ? 's' : ''}. Si rien n'arrive, vérifie que Chrome a le droit d'afficher les notifications (réglages Android).`
}
