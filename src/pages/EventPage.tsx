import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Screen } from '../components/Layout'
import { BackButton } from '../components/BackButton'
import { HeaderMenu } from '../components/HeaderMenu'
import { Sheet } from '../components/Sheet'
import { Avatar } from '../components/Avatar'
import { EventForm, type EventFields } from '../components/EventForm'
import { ask, notify } from '../components/Dialog'
import { IconCalendar, IconTrash } from '../components/Icons'
import { supabase, errMsg, type CalEvent, type EventReply } from '../lib/supabase'
import { readCache, writeCache, useOnResume, useOnline } from '../lib/network'
import { dbWrite, flushWrites } from '../lib/offlineDb'
import { useMe } from '../lib/auth'
import { OfflineLocked } from '../components/OfflineLocked'
import { isShared } from '../lib/tools'
import { eventWhen, repeatLabel, usePeople, forgetTool } from '../lib/tools'

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/** Un événement du calendrier : je viens / je ne viens pas, et la réponse de chacun */
export default function EventPage() {
  const { id = '' } = useParams()
  const me = useMe()
  const nav = useNavigate()
  const backTo = (useLocation().state as { from?: string } | null)?.from ?? '/calendar'
  const [ev, setEv] = useState<CalEvent | null>(() => readCache<CalEvent | null>(`event:${id}`, null))
  const [replies, setReplies] = useState<EventReply[]>(() => readCache<EventReply[]>(`event-replies:${id}`, []))
  const [missing, setMissing] = useState(false)
  const online = useOnline()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<EventFields>({ title: '', day: null, time: '', place: '', repeat: null, until: null })
  const people = usePeople(ev)

  const load = async () => {
    await flushWrites()
    supabase.from('events').select('*').eq('id', id).maybeSingle().then(({ data }) => {
      if (data) { setEv(data); writeCache(`event:${id}`, data) } else if (navigator.onLine) setMissing(true)
    })
    supabase.from('event_replies').select('*').eq('event_id', id).then(({ data }) => {
      if (data) { setReplies(data); writeCache(`event-replies:${id}`, data) }
    })
  }
  useEffect(() => {
    load()
    const ch = supabase.channel(`event-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'event_replies', filter: `event_id=eq.${id}` }, load)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'events', filter: `id=eq.${id}` }, load)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [id]) // eslint-disable-line react-hooks/exhaustive-deps
  useOnResume(load)

  const mine = replies.find((r) => r.user_id === me)
  const answer = async (going: boolean) => {
    const prev = replies
    // retoucher sa réponse l'annule
    if (mine?.going === going) {
      setReplies(replies.filter((r) => r.user_id !== me))
      const { error } = await supabase.from('event_replies').delete().eq('event_id', id).eq('user_id', me)
      if (error) { setReplies(prev); notify(errMsg(error)) }
      return
    }
    setReplies([...replies.filter((r) => r.user_id !== me), { event_id: id, user_id: me, going }])
    const { error } = await supabase.from('event_replies').upsert({ event_id: id, user_id: me, going })
    if (error) { setReplies(prev); notify(errMsg(error)) }
  }

  const startEdit = () => {
    if (!ev) return
    setForm({ title: ev.title, day: new Date(`${ev.day}T00:00:00`), time: ev.at_time?.slice(0, 5) ?? '', place: ev.place ?? '', repeat: ev.repeat ?? null, until: ev.repeat_until ?? null })
    setEditing(true)
  }
  const save = async () => {
    const patch = { title: form.title.trim(), day: ymd(form.day!), at_time: form.time || null, place: form.place.trim() || null, repeat: form.repeat, repeat_until: form.repeat ? form.until : null }
    const { error } = await dbWrite({ table: 'events', op: 'update', values: patch, match: { id } })
    if (error) return notify(errMsg(error))
    setEv((e) => { const n = e && { ...e, ...patch }; writeCache(`event:${id}`, n); return n }); setEditing(false)
  }
  const destroy = async () => {
    if (!(await ask('Supprimer cet événement pour tout le monde ?'))) return
    const { error } = await dbWrite({ table: 'events', op: 'delete', match: { id } })
    if (error) return notify(errMsg(error))
    forgetTool('calendar', id)
    nav(backTo, { replace: true })
  }

  const shared = !!ev && (!!ev.conversation_id || ev.participants.length > 1)
  const status = (uid: string) => replies.find((r) => r.user_id === uid)
  const yes = people.filter((p) => status(p.id)?.going)
  const no = people.filter((p) => status(p.id)?.going === false)
  const wait = people.filter((p) => !status(p.id))

  return (
    <Screen header={<><BackButton to={backTo} /><h1>Événement</h1><HeaderMenu convId={ev?.conversation_id ?? undefined} /></>}>
      {missing ? <p className="empty">Cet événement n'existe plus ou tu n'y as plus accès.</p> : !online && ev && isShared(ev) ? <OfflineLocked /> : ev && <>
        <button className="card event-head" onClick={startEdit}>
          <span className="event-head-icon"><IconCalendar size={22} /></span>
          <span>
            <b>{ev.title}</b>
            <span className="muted">{eventWhen(ev.day, ev.at_time, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
            {ev.repeat && <span className="muted">🔁 {repeatLabel(ev)}</span>}
            {ev.place && <span className="muted">📍 {ev.place}</span>}
          </span>
        </button>

        {shared && <>
          <div className="event-answer">
            <button className={`btn wide${mine?.going ? ' primary' : ''}`} onClick={() => answer(true)}>✓ Je viens</button>
            <button className={`btn wide${mine?.going === false ? ' danger-btn' : ''}`} onClick={() => answer(false)}>✗ Je ne viens pas</button>
          </div>
          {([['Viennent', yes, 'yes'], ['Ne viennent pas', no, 'no'], ['Pas encore répondu', wait, 'wait']] as const).map(([label, list, k]) => list.length > 0 && (
            <div key={k}>
              <div className="section-title">{label} ({list.length})</div>
              <div className="list-card">
                {list.map((p) => (
                  <div key={p.id} className="settings-row event-person">
                    <Avatar name={p.display_name} url={p.avatar_url} size={32} />
                    <span>{p.id === me ? 'Moi' : p.display_name}</span>
                    <span className={`event-me ${k}`}>{k === 'yes' ? '✓' : k === 'no' ? '✗' : '?'}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </>}

        {ev.conversation_id && <button className="btn wide" onClick={() => nav(`/c/${ev.conversation_id}`)}>Voir dans la conversation</button>}
        <button className="settings-row danger note-delete" onClick={destroy}><IconTrash /><span>Supprimer l'événement</span></button>
      </>}

      <Sheet open={editing} onClose={() => setEditing(false)} title="Modifier l'événement" form>
        <EventForm value={form} onChange={setForm} />
        <button className="btn primary wide" disabled={!form.title.trim() || !form.day} onClick={save}>Enregistrer</button>
      </Sheet>
    </Screen>
  )
}
