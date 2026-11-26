import { BackButton } from '../components/BackButton'
import { LimitedInput } from '../components/LimitedInput'
import { notify } from '../components/Dialog'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, errMsg } from '../lib/supabase'
import { Screen } from '../components/Layout'
import { FriendPicker } from '../components/FriendPicker'

export default function NewGroup() {
  const nav = useNavigate()
  const [name, setName] = useState('')
  const [ids, setIds] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  // une seule personne : pas de groupe, on ouvre la discussion à deux
  const solo = ids.length === 1
  const create = async () => {
    setBusy(true)
    if (solo) {
      const { data, error } = await supabase.rpc('get_or_create_dm', { friend: ids[0] })
      setBusy(false)
      if (error) return notify(errMsg(error))
      return nav(`/c/${data}`, { replace: true })
    }
    const { data, error } = await supabase.rpc('create_group', { group_name: name, member_ids: ids })
    setBusy(false)
    if (error) return notify(errMsg(error))
    nav(`/c/${data}`, { replace: true })
  }

  return (
    <Screen header={<>
      <BackButton to="/" />
      <h1>Nouveau groupe</h1><span className="icon-btn" />
    </>} footer={
      <div className="footer-bar"><button className="btn primary wide" disabled={(!solo && !name.trim()) || busy} onClick={create}>
        {solo ? 'Ouvrir la discussion' : `Créer le groupe${ids.length ? ` (${ids.length + 1})` : ''}`}
      </button></div>
    }>
      <div className="card form"><LimitedInput placeholder="Nom du groupe" value={name} max={40} onChange={(e) => setName(e.target.value)} autoFocus /></div>
      {solo && <p className="muted small share-hint">Une seule personne : ce sera une discussion à deux, pas un groupe.</p>}
      <div className="section-title">Membres</div>
      <FriendPicker selected={ids} onChange={setIds} />
    </Screen>
  )
}
