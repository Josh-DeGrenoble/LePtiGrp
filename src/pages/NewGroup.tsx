import { notify } from '../components/Dialog'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase, errMsg } from '../lib/supabase'
import { Screen } from '../components/Layout'
import { FriendPicker } from '../components/FriendPicker'
import { IconBack } from '../components/Icons'

export default function NewGroup() {
  const nav = useNavigate()
  const [name, setName] = useState('')
  const [ids, setIds] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  const create = async () => {
    setBusy(true)
    const { data, error } = await supabase.rpc('create_group', { group_name: name, member_ids: ids })
    setBusy(false)
    if (error) return notify(errMsg(error))
    nav(`/c/${data}`, { replace: true })
  }

  return (
    <Screen header={<>
      <Link to="/" className="icon-btn" aria-label="Retour"><IconBack /></Link>
      <h1>Nouveau groupe</h1><span className="icon-btn" />
    </>} footer={
      <div className="footer-bar"><button className="btn primary wide" disabled={!name.trim() || busy} onClick={create}>
        Créer le groupe{ids.length ? ` (${ids.length + 1})` : ''}
      </button></div>
    }>
      <div className="card form"><input placeholder="Nom du groupe" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} autoFocus /></div>
      <div className="section-title">Membres</div>
      <FriendPicker selected={ids} onChange={setIds} />
    </Screen>
  )
}
