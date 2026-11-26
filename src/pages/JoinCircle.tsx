import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { errMsg } from '../lib/supabase'
import { circleMessage, joinCircle } from '../lib/friends'

/** Arrivée via un lien « cercle d'amis » : /cercle/<jeton> */
export default function JoinCircle() {
  const { token = '' } = useParams()
  const [state, setState] = useState('Ajout en cours…')
  const done = useRef(false)
  useEffect(() => {
    if (done.current) return
    done.current = true
    joinCircle(token).then((r) => setState(circleMessage(r)), (e) => setState(errMsg(e)))
  }, [token])
  return (
    <div className="login">
      <h1 className="logo">LePtiGrp</h1>
      <p className="card center">{state}</p>
      <Link to="/friends" className="btn primary">Voir mes amis</Link>
    </div>
  )
}
