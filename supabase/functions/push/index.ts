// Supabase Edge Function "push" : envoie les notifications d'un nouveau message ou d'un épinglage.
// Appelée par le déclencheur SQL public.notify_push() (voir supabase/push.sql).
// Secrets requis : VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, PUSH_SECRET (+ VAPID_SUBJECT facultatif).
import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2'

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') ?? 'https://le-pti-grp.vercel.app',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
)

const short = (s: string, n = 120) => (s.length > n ? s.slice(0, n - 1) + '…' : s)

type Sub = { endpoint: string; p256dh: string; auth: string }
// Envoie une notification à chaque appareil ; supprime les abonnements expirés (appli désinstallée, notifs coupées)
const sendAll = (subs: Sub[], payload: string) => Promise.allSettled(subs.map((s) =>
  webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400 })
    .catch(async (e: { statusCode?: number }) => {
      if (e.statusCode === 404 || e.statusCode === 410) await db.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
      throw e
    })))

// Rappels échus : on les marque envoyés d'abord (un appel en double ne les renvoie pas)
async function sendReminders() {
  const { data: due } = await db.from('reminders').update({ sent_at: new Date().toISOString() })
    .is('sent_at', null).lte('remind_at', new Date().toISOString()).select()
  for (const r of due ?? []) {
    const { data: subs } = await db.from('push_subscriptions').select('*').eq('user_id', r.user_id)
    const payload = JSON.stringify({ title: '⏰ Rappel', body: short(r.message), url: r.conversation_id ? `/c/${r.conversation_id}` : '/', tag: `reminder-${r.client_id ?? r.id}` })
    await sendAll(subs ?? [], payload)
  }
  return Response.json({ reminders: due?.length ?? 0 })
}

// Remplissage de la base ou du stockage (palier de 10 % franchi) : notification aux admins de l'appli
async function sendUsage(kind: 'db' | 'storage', pct: number) {
  const { data: admins } = await db.from('app_admins').select('user_id')
  const { data: subs } = await db.from('push_subscriptions').select('*').in('user_id', (admins ?? []).map((a) => a.user_id))
  const what = kind === 'db' ? 'La base de données' : 'Le stockage des fichiers'
  const payload = JSON.stringify({ title: `${pct >= 80 ? '🚨' : '📊'} ${what} à ${pct} %`, body: 'Détail dans Paramètres > Serveur.', url: '/settings', tag: `usage-${kind}` })
  await sendAll(subs ?? [], payload)
  return Response.json({ usage: kind, pct })
}

// Bouton « Tester » des réglages : appelé par l'appli avec la session de l'utilisateur, envoie une notif à ses appareils
// et renvoie le détail (nombre d'abonnements, codes d'erreur du service push) pour diagnostiquer
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info' }
async function sendTest(req: Request) {
  const { data: { user } } = await db.auth.getUser((req.headers.get('authorization') ?? '').replace('Bearer ', ''))
  if (!user) return Response.json({ error: 'not signed in' }, { status: 401, headers: cors })
  const { data: subs } = await db.from('push_subscriptions').select('*').eq('user_id', user.id)
  const payload = JSON.stringify({ title: '🔔 Test', body: 'Les notifications marchent !', url: '/settings', tag: 'test' })
  const results = await sendAll(subs ?? [], payload)
  return Response.json({
    subs: results.length,
    sent: results.filter((r) => r.status === 'fulfilled').length,
    errors: results.flatMap((r) => (r.status === 'rejected' ? [`${(r.reason as { statusCode?: number }).statusCode ?? '?'} ${String((r.reason as { body?: string }).body ?? r.reason).slice(0, 120)}`] : [])),
    trigger_secret: !!Deno.env.get('PUSH_SECRET'), vapid: !!Deno.env.get('VAPID_PRIVATE_KEY'),
  }, { headers: cors })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (!req.headers.get('x-push-secret')) return sendTest(req)
  if (req.headers.get('x-push-secret') !== Deno.env.get('PUSH_SECRET')) return new Response('forbidden', { status: 403 })
  const body = await req.json() as { event: 'message' | 'pin' | 'reminders' | 'usage'; message_id: number; kind?: 'db' | 'storage'; pct?: number }
  const { event, message_id } = body
  if (event === 'reminders') return sendReminders()
  if (event === 'usage') return sendUsage(body.kind!, body.pct!)

  const { data: msg } = await db.from('messages').select('*').eq('id', message_id).single()
  if (!msg) return new Response('no message')
  const actorId = event === 'pin' ? msg.pinned_by : msg.author_id

  const [{ data: conv }, { data: members }, { data: actor }] = await Promise.all([
    db.from('conversations').select('id, name, is_group').eq('id', msg.conversation_id).single(),
    db.from('members').select('user_id, notify_all, notify_mentions, notify_pins, notify_tools, profiles(notify_tools_default)').eq('conversation_id', msg.conversation_id),
    db.from('profiles').select('display_name').eq('id', actorId).single(),
  ])
  const who = actor?.display_name ?? "Quelqu'un"

  // Qui reçoit la notification, selon ses réglages pour cette conversation
  const recipients = (members ?? []).filter((m) => {
    if (m.user_id === actorId) return false
    if (event === 'pin') return m.notify_pins
    // activité des outils : « Notif » cochée pour cet outil (réglage de la conv, sinon celui par défaut du profil)
    if (msg.kind === 'activity') return (m.notify_tools ?? (m.profiles as unknown as { notify_tools_default?: string[] } | null)?.notify_tools_default ?? ['list', 'poll', 'ledger']).includes(msg.tool)
    const mentioned = msg.mention_all || (msg.mentions ?? []).includes(m.user_id)
    return m.notify_all || (m.notify_mentions && mentioned)
  }).map((m) => m.user_id)
  if (!recipients.length) return new Response('nobody')

  const { data: subs } = await db.from('push_subscriptions').select('*').in('user_id', recipients)

  // Chiffrement de bout en bout : le serveur ne connaît pas le texte. Il envoie un texte neutre,
  // plus le message chiffré s'il est assez court : le téléphone le déchiffre lui-même (service worker).
  const title = conv?.is_group ? conv.name : who
  const prefix = event === 'pin' ? `📌 ${who} a épinglé : ` : conv?.is_group ? `${who} : ` : ''
  const fallback = event === 'pin' ? `📌 ${who} a épinglé un message` : conv?.is_group ? `${who} : nouveau message` : 'Nouveau message'
  const body = msg.ciphertext ? fallback : prefix + short(msg.content ?? '')
  const e2ee = msg.ciphertext && msg.ciphertext.length <= 2800
    ? { c: msg.conversation_id, e: msg.epoch, id: msg.client_id, ct: msg.ciphertext, a: msg.author_id, prefix }
    : undefined
  const payload = msg.kind === 'activity'
    ? JSON.stringify({ title, body: `${who} · ${short(msg.tool_name ?? '', 40)} : ${short(msg.content ?? '', 100)}`, url: `/c/${msg.conversation_id}`, tag: `${msg.conversation_id}-activity` })
    : JSON.stringify({ title, body, url: `/c/${msg.conversation_id}`, tag: `${msg.conversation_id}-${event}`, e2ee })

  const results = await sendAll(subs ?? [], payload)
  return Response.json({ sent: results.filter((r) => r.status === 'fulfilled').length, total: results.length })
})
