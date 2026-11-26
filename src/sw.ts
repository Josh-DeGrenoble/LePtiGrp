/// <reference lib="webworker" />
// Service worker : appli disponible hors-ligne + réception des notifications push
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { clientsClaim } from 'workbox-core'
import { ready, local, openMessage, sigOk } from './lib/crypto/core'

declare let self: ServiceWorkerGlobalScope

self.skipWaiting()
clientsClaim()
cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')))

type Payload = { title: string; body: string; url: string; tag: string
  e2ee?: { c: string; e: number; id: string; ct: string; a: string; prefix: string } }

/** Déchiffre le message reçu avec les clés gardées sur le téléphone ; sinon texte neutre du serveur */
async function decryptBody(d: Payload) {
  const x = d.e2ee
  if (!x) return d.body
  try {
    await ready()
    const key = await local.epochKey(x.c, x.e)
    if (!key) return d.body
    const m = openMessage(key, x.c, x.e, x.id, x.ct)
    if (!m || m.body.u !== x.a) return d.body
    const pins = await local.pins()
    if (!pins[x.a]?.signs.some((s) => sigOk(m.sig, m.signed, s))) return d.body
    const t = x.prefix + m.body.t
    return t.length > 120 ? t.slice(0, 119) + '…' : t
  } catch { return d.body }
}

self.addEventListener('push', (event) => {
  const data = event.data?.json() as Payload | undefined
  if (!data) return
  event.waitUntil((async () => {
    // Pas de notif si la conversation est déjà ouverte à l'écran
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    if (wins.some((w) => w.visibilityState === 'visible' && new URL(w.url).pathname === data.url)) return
    await self.registration.showNotification(data.title, {
      body: await decryptBody(data), tag: data.tag, data: { url: data.url }, icon: '/icon-v3-192.png', badge: '/badge-v1.png',
    })
  })())
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data as { url?: string })?.url ?? '/'
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const win = wins[0]
    if (win) { await win.focus(); await win.navigate(url) } else await self.clients.openWindow(url)
  })())
})
