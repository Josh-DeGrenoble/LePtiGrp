/// <reference lib="webworker" />
// Service worker : appli disponible hors-ligne + réception des notifications push
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { clientsClaim } from 'workbox-core'

declare let self: ServiceWorkerGlobalScope

self.skipWaiting()
clientsClaim()
cleanupOutdatedCaches()
precacheAndRoute(self.__WB_MANIFEST)
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')))

type Payload = { title: string; body: string; url: string; tag: string }

self.addEventListener('push', (event) => {
  const data = event.data?.json() as Payload | undefined
  if (!data) return
  event.waitUntil((async () => {
    // Pas de notif si la conversation est déjà ouverte à l'écran
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    if (wins.some((w) => w.visibilityState === 'visible' && new URL(w.url).pathname === data.url)) return
    await self.registration.showNotification(data.title, {
      body: data.body, tag: data.tag, data: { url: data.url }, icon: '/icon-v3-192.png', badge: '/icon-v3-192.png',
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
