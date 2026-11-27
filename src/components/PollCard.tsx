import { useEffect, useState } from 'react'
import { supabase, errMsg, type Poll, type Vote } from '../lib/supabase'
import { readCache, writeCache } from '../lib/network'
import { useMe } from '../lib/auth'
import { usePeople } from '../lib/tools'
import { notify } from './Dialog'

/** Sondage votable (page Sondage et message dans le chat), résultats en direct */
export function PollCard({ pollId, compact, version = 0 }: { pollId: string; compact?: boolean; version?: number }) {
  const me = useMe()
  const [poll, setPoll] = useState<Poll | null>(() => readCache<Poll | null>(`poll:${pollId}`, null))
  const [votes, setVotes] = useState<Vote[]>(() => readCache<Vote[]>(`votes:${pollId}`, []))
  const people = usePeople(poll)
  const nameOf = (uid: string) => (uid === me ? 'moi' : people.find((p) => p.id === uid)?.display_name ?? '?')

  useEffect(() => {
    const load = async () => {
      const [{ data: p }, { data: v }] = await Promise.all([
        supabase.from('polls').select('*').eq('id', pollId).maybeSingle(),
        supabase.from('poll_votes').select('*').eq('poll_id', pollId),
      ])
      if (p) { setPoll(p); writeCache(`poll:${pollId}`, p) }
      if (v) { setVotes(v); writeCache(`votes:${pollId}`, v) }
    }
    load()
    const ch = supabase.channel(`poll-${pollId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'poll_votes', filter: `poll_id=eq.${pollId}` }, load)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'polls', filter: `id=eq.${pollId}` }, load)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [pollId, version])

  if (!poll) return <div className="poll muted small">Sondage indisponible</div>

  const closed = !!poll.closes_at && Date.parse(poll.closes_at) <= Date.now()
  const closesLabel = poll.closes_at && new Date(poll.closes_at).toLocaleString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  const mine = votes.filter((v) => v.user_id === me).map((v) => v.option)
  const voters = new Set(votes.map((v) => v.user_id)).size
  const vote = async (option: number) => {
    if (closed) return notify('Ce sondage est clôturé.')
    const had = mine.includes(option)
    // choix unique : voter ailleurs remplace mon vote
    const drop = had ? [option] : poll.multiple ? [] : mine
    setVotes((vs) => [...vs.filter((v) => !(v.user_id === me && drop.includes(v.option))), ...(had ? [] : [{ poll_id: pollId, user_id: me, option }])])
    const r1 = drop.length ? await supabase.from('poll_votes').delete().eq('poll_id', pollId).eq('user_id', me).in('option', drop) : { error: null }
    const r2 = had ? { error: null } : await supabase.from('poll_votes').insert({ poll_id: pollId, option })
    if (r1.error || r2.error) notify(errMsg(r1.error ?? r2.error))
  }

  return (
    <div className={`poll${compact ? ' compact' : ''}`} onClick={(e) => e.stopPropagation()}>
      {!compact && <div className="poll-question">{poll.question}</div>}
      <div className="poll-meta">{poll.multiple ? 'Plusieurs réponses possibles' : 'Une seule réponse'} · {voters} votant{voters > 1 ? 's' : ''}
        {closed ? <b className="poll-closed"> · 🔒 Clôturé</b> : closesLabel && <span> · clôture {closesLabel}</span>}</div>
      {poll.options.map((o, i) => {
        const who = votes.filter((v) => v.option === i).map((v) => v.user_id)
        const pct = voters ? Math.round((who.length / voters) * 100) : 0
        return (
          <button key={i} className={`poll-option${mine.includes(i) ? ' on' : ''}${closed ? ' closed' : ''}`} onClick={() => vote(i)}>
            <span className="poll-bar" style={{ width: `${pct}%` }} />
            <span className="poll-label"><span className="poll-check" />{o}</span>
            <span className="poll-count">{who.length}</span>
            {who.length > 0 && <small className="poll-who">{who.map(nameOf).join(', ')}</small>}
          </button>
        )
      })}
    </div>
  )
}
