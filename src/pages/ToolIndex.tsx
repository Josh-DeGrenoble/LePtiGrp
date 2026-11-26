import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Screen } from '../components/Layout'
import { BackButton } from '../components/BackButton'
import { HeaderMenu } from '../components/HeaderMenu'
import { ToolIcon } from '../components/ToolIcon'
import { IconBack, IconPlus } from '../components/Icons'
import { supabase, type ConvSummary } from '../lib/supabase'
import { readCache, writeCache, useOnResume } from '../lib/network'
import { TOOLS, cachedTools, loadTools, type ToolItem, type ToolKind } from '../lib/tools'

/** Page d'un outil (pense-bêtes, comptes, sondages) : tous mes éléments, rangés par partage */
export default function ToolIndex({ kind }: { kind: ToolKind }) {
  const nav = useNavigate()
  const [items, setItems] = useState<ToolItem[]>(() => cachedTools(kind))
  const [convs, setConvs] = useState<ConvSummary[]>(() => readCache<ConvSummary[]>('convs', []))

  const load = () => {
    loadTools(kind).then(setItems).catch(() => {})
    supabase.rpc('my_conversations').then(({ data }) => { if (data) { setConvs(data); writeCache('convs', data) } })
  }
  useEffect(load, [kind]) // eslint-disable-line react-hooks/exhaustive-deps
  useOnResume(load)

  const convName = new Map(convs.map((c) => [c.id, c.name ?? 'Discussion']))
  const sectionOf = (i: ToolItem) => i.conversation_id ? convName.get(i.conversation_id) ?? 'Conversation' : i.participants.length > 1 ? 'Partagés' : 'Perso'
  const order = (s: string) => (s === 'Perso' ? 0 : s === 'Partagés' ? 1 : 2)
  const sections = new Map<string, ToolItem[]>()
  for (const i of items) sections.set(sectionOf(i), [...(sections.get(sectionOf(i)) ?? []), i])
  const sorted = [...sections.entries()].sort(([a], [b]) => order(a) - order(b) || a.localeCompare(b, 'fr'))

  return (
    <Screen header={<><BackButton to="/" /><h1>{TOOLS[kind].label}</h1><HeaderMenu /></>}>
      {items.length === 0 && <p className="empty">Rien pour l'instant. Touche + pour commencer.</p>}
      {sorted.map(([title, list]) => (
        <div key={title} className="fade-in">
          <div className="section-title">{title}</div>
          <div className="list-card">
            {list.map((i) => (
              <button key={i.id} className="settings-row note-row" onClick={() => nav(`/${kind}/${i.id}`, { state: { from: `/${kind}` } })}>
                <ToolIcon kind={kind} /><span className="note-name">{i.title}</span>
                <small>{i.summary}</small>
                <span className="chevron"><IconBack size={18} /></span>
              </button>
            ))}
          </div>
        </div>
      ))}
      <Link to={`/${kind}/new`} className="fab" aria-label={TOOLS[kind].newTitle}><IconPlus size={32} /></Link>
    </Screen>
  )
}
