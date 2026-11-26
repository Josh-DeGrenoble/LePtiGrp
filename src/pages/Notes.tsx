import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Screen } from '../components/Layout'
import { BackButton } from '../components/BackButton'
import { HeaderMenu } from '../components/HeaderMenu'
import { LimitedInput } from '../components/LimitedInput'
import { notify } from '../components/Dialog'
import { IconBack, IconList } from '../components/Icons'
import { supabase, errMsg, type ConvSummary } from '../lib/supabase'
import { readCache, writeCache, useOnResume } from '../lib/network'
import { cachedLists, createList, loadLists, type ListSummary } from '../lib/lists'

/** Tous mes pense-bêtes : les miens, puis ceux de chaque conversation */
export default function Notes() {
  const nav = useNavigate()
  const [lists, setLists] = useState<ListSummary[]>(cachedLists)
  const [convs, setConvs] = useState<ConvSummary[]>(() => readCache<ConvSummary[]>('convs', []))
  const [name, setName] = useState('')
  const [target, setTarget] = useState('')

  const load = () => {
    loadLists().then(setLists).catch(() => {})
    supabase.rpc('my_conversations').then(({ data }) => { if (data) { setConvs(data); writeCache('convs', data) } })
  }
  useEffect(load, [])
  useOnResume(load)

  const open = (id: string) => nav(`/notes/${id}`, { state: { from: '/notes' } })
  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    try { open((await createList(name, target || null)).id) } catch (err) { notify(errMsg(err)) }
  }

  const convName = new Map(convs.map((c) => [c.id, c.name ?? 'Discussion']))
  const groups = new Map<string, ListSummary[]>()
  for (const l of lists) {
    const key = l.conversation_id ?? ''
    groups.set(key, [...(groups.get(key) ?? []), l])
  }
  const sections = [...groups.entries()].sort(([a], [b]) => (a === '' ? -1 : b === '' ? 1 : (convName.get(a) ?? '').localeCompare(convName.get(b) ?? '')))

  return (
    <Screen header={<><BackButton to="/" /><h1>Pense-bête</h1><HeaderMenu /></>}>
      <form className="note-create" onSubmit={create}>
        <LimitedInput max={40} placeholder="Nouveau pense-bête" value={name} onChange={(e) => setName(e.target.value)} />
        <div className="inline-form">
          <select value={target} onChange={(e) => setTarget(e.target.value)} aria-label="Partagé avec">
            <option value="">Pour moi seul</option>
            {convs.map((c) => <option key={c.id} value={c.id}>Avec : {c.name ?? 'Discussion'}</option>)}
          </select>
          <button className="btn primary" disabled={!name.trim()}>Créer</button>
        </div>
      </form>

      {lists.length === 0 && <p className="empty">Aucun pense-bête pour l'instant.</p>}
      {sections.map(([conv, ls]) => (
        <div key={conv} className="fade-in">
          <div className="section-title">{conv ? convName.get(conv) ?? 'Conversation' : 'Perso'}</div>
          <div className="list-card">
            {ls.map((l) => (
              <button key={l.id} className="settings-row note-row" onClick={() => open(l.id)}>
                <IconList /><span className="note-name">{l.name}</span>
                <small>{l.total === 0 ? 'Vide' : l.left === 0 ? 'Tout est coché' : `${l.left} à faire`}</small>
                <span className="chevron"><IconBack size={18} /></span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </Screen>
  )
}
