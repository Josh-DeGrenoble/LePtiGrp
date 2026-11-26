import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase, errMsg } from '../lib/supabase'

/** Arrivée via un lien d'ami : /add/12345 */
export default function AddFriend() {
  const { code } = useParams()
  const [state, setState] = useState('Ajout en cours…')
  const done = useRef(false)
  useEffect(() => {
    if (done.current) return
    done.current = true
    supabase.rpc('add_friend_by_code', { code }).then(({ data, error }) => {
      const friend = data as { id: string | null; display_name: string } | null
      setState(error ? errMsg(error) : !friend?.id ? 'Code inconnu' : `${friend.display_name} est maintenant ton ami(e) !`)
    })
  }, [code])
  return (
    <div className="login">
      <h1 className="logo">LePtiGrp</h1>
      <p className="card center">{state}</p>
      <Link to="/friends" className="btn primary">Voir mes amis</Link>
    </div>
  )
}
