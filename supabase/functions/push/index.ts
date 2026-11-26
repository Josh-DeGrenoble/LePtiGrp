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
    const payload = JSON.stringify({ title: '⏰ Rappel', body: short(r.message), url: r.conversation_id ? `/c/${r.conversation_id}` : '/', tag: `reminder-${r.id}` })
    await sendAll(subs ?? [], payload)
  }
  return Response.json({ reminders: due?.length ?? 0 })
}

Deno.serve(async (req) => {
  if (req.headers.get('x-push-secret') !== Deno.env.get('PUSH_SECRET')) return new Response('forbidden', { status: 403 })
  const { event, message_id } = await req.json() as { event: 'message' | 'pin' | 'reminders'; message_id: number }
  if (event === 'reminders') return sendReminders()

  const { data: msg } = await db.from('messages').select('*').eq('id', message_id).single()
  if (!msg) return new Response('no message')
  const actorId = event === 'pin' ? msg.pinned_by : msg.author_id

  const [{ data: conv }, { data: members }, { data: actor }] = await Promise.all([
    db.from('conversations').select('id, name, is_group').eq('id', msg.conversation_id).single(),
    db.from('members').select('user_id, notify_all, notify_mentions, notify_pins').eq('conversation_id', msg.conversation_id),
    db.from('profiles').select('display_name').eq('id', actorId).single(),
  ])
  const who = actor?.display_name ?? "Quelqu'un"

  // Qui reçoit la notification, selon ses réglages pour cette conversation
  const recipients = (members ?? []).filter((m) => {
    if (m.user_id === actorId) return false
    if (event === 'pin') return m.notify_pins
    const mentioned = msg.mention_all || (msg.mentions ?? []).includes(m.user_id)
    return m.notify_all || (m.notify_mentions && mentioned)
  }).map((m) => m.user_id)
  if (!recipients.length) return new Response('nobody')

  const { data: subs } = await db.from('push_subscriptions').select('*').in('user_id', recipients)

  const title = conv?.is_group ? conv.name : who
  const body = event === 'pin'
    ? `📌 ${who} a épinglé : ${short(msg.content)}`
    : conv?.is_group ? `${who} : ${short(msg.content)}` : short(msg.content)
  const payload = JSON.stringify({ title, body, url: `/c/${msg.conversation_id}`, tag: `${msg.conversation_id}-${event}` })

  const results = await sendAll(subs ?? [], payload)
  return Response.json({ sent: results.filter((r) => r.status === 'fulfilled').length, total: results.length })
})
