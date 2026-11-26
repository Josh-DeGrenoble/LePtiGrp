import { useEffect, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { Screen } from '../components/Layout'
import { BackButton } from '../components/BackButton'
import { HeaderMenu } from '../components/HeaderMenu'
import { PollCard } from '../components/PollCard'
import { ask, notify } from '../components/Dialog'
import { IconTrash } from '../components/Icons'
import { supabase, errMsg, type Poll } from '../lib/supabase'
import { readCache } from '../lib/network'

export default function PollPage() {
  const { id = '' } = useParams()
  const nav = useNavigate()
  const backTo = (useLocation().state as { from?: string } | null)?.from ?? '/polls'
  const [poll, setPoll] = useState<Poll | null>(() => readCache<Poll | null>(`poll:${id}`, null))
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    supabase.from('polls').select('*').eq('id', id).maybeSingle().then(({ data }) => {
      if (data) setPoll(data)
      else if (navigator.onLine) setMissing(true)
    })
  }, [id])

  const destroy = async () => {
    if (!(await ask('Supprimer ce sondage et tous ses votes ?'))) return
    const { error } = await supabase.from('polls').delete().eq('id', id)
    if (error) return notify(errMsg(error))
    nav(backTo, { replace: true })
  }

  return (
    <Screen header={<><BackButton to={backTo} /><h1>Sondage</h1><HeaderMenu convId={poll?.conversation_id ?? undefined} /></>}>
      {missing ? <p className="empty">Ce sondage n'existe plus ou tu n'y as plus accès.</p> : <>
        <div className="card"><PollCard pollId={id} /></div>
        {poll?.conversation_id && <button className="btn wide" onClick={() => nav(`/c/${poll.conversation_id}`)}>Voir dans la conversation</button>}
        {poll && <button className="settings-row danger note-delete" onClick={destroy}><IconTrash /><span>Supprimer le sondage</span></button>}
      </>}
    </Screen>
  )
}
