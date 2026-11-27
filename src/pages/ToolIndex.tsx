import { useEffect, useState } from 'react'
import { EmptyState } from '../components/EmptyState'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Screen } from '../components/Layout'
import { BackButton } from '../components/BackButton'
import { HeaderMenu } from '../components/HeaderMenu'
import { ToolIcon } from '../components/ToolIcon'
import { IconBack, IconLock, IconPlus } from '../components/Icons'
import { notify } from '../components/Dialog'
import type { ConvSummary } from '../lib/supabase'
import { useOnResume, useOnline } from '../lib/network'
import { cachedConversations, fetchConversations } from '../lib/myConversations'
import { TOOLS, cachedTools, isShared, loadTools, type ToolItem, type ToolKind } from '../lib/tools'

/** Page d'un outil (pense-bêtes, comptes, sondages) : tous mes éléments, rangés par partage */
export default function ToolIndex({ kind }: { kind: ToolKind }) {
  const nav = useNavigate()
  const st = useLocation().state as { from?: string; root?: string } | null
  const backTo = st?.from ?? '/'
  const [items, setItems] = useState<ToolItem[]>(() => cachedTools(kind))
  const [loaded, setLoaded] = useState(() => items.length > 0)
  const online = useOnline()
  const [convs, setConvs] = useState<ConvSummary[]>(cachedConversations)

  const load = () => {
    loadTools(kind).then(setItems).catch(() => {}).finally(() => setLoaded(true))
    fetchConversations().then((d) => { if (d) setConvs(d) })
  }
  useEffect(load, [kind]) // eslint-disable-line react-hooks/exhaustive-deps
  useOnResume(load)

  const convName = new Map(convs.map((c) => [c.id, c.name ?? 'Discussion']))
  const sectionOf = (i: ToolItem) => i.conversation_id ? convName.get(i.conversation_id) ?? 'Conversation' : (i.participants?.length ?? 0) > 1 ? 'Partagés' : 'Perso'
  const order = (s: string) => (s === 'Perso' ? 0 : s === 'Partagés' ? 1 : 2)
  const sections = new Map<string, ToolItem[]>()
  for (const i of items) sections.set(sectionOf(i), [...(sections.get(sectionOf(i)) ?? []), i])
  const sorted = [...sections.entries()].sort(([a], [b]) => order(a) - order(b) || a.localeCompare(b, 'fr'))

  return (
    <Screen header={<><BackButton to={backTo} /><h1>{TOOLS[kind].label}</h1><HeaderMenu /></>}>
      {!loaded && items.length === 0 && <div className="list-card skeleton-list" aria-label="Chargement…">
        {[0, 1, 2].map((i) => <div key={i} className="sk-row" style={{ animationDelay: `${i * 90}ms` }}><span className="sk sk-icon" /><span className="sk" style={{ width: `${40 + i * 15}%` }} /></div>)}
      </div>}
      {loaded && items.length === 0 && <EmptyState icon={<ToolIcon kind={kind} size={34} />} title="Rien pour l'instant"
        text="Crée le premier, pour toi seul ou à partager."
        action={<Link to={`/${kind}/new`} state={{ root: st?.root }} className="btn primary with-icon"><IconPlus size={18} /> {TOOLS[kind].newTitle}</Link>} />}
      {sorted.map(([title, list]) => (
        <div key={title} className="fade-in">
          <div className="section-title">{title}</div>
          <div className="list-card">
            {list.map((i) => (
              <button key={i.id} className={`settings-row note-row${!online && isShared(i) ? ' offline-dim' : ''}`}
                onClick={() => !online && isShared(i) ? notify('Pas de réseau : il faut être connecté pour ouvrir un élément partagé.') : nav(`/${kind}/${i.id}`, { state: { from: `/${kind}`, root: st?.root } })}>
                <ToolIcon kind={kind} /><span className="note-name">{i.title}</span>
                <small>{!online && isShared(i) ? <IconLock size={14} /> : i.summary}</small>
                <span className="chevron"><IconBack size={18} /></span>
              </button>
            ))}
          </div>
        </div>
      ))}
      <Link to={`/${kind}/new`} state={{ root: st?.root }} className="fab" aria-label={TOOLS[kind].newTitle}><IconPlus size={32} /></Link>
    </Screen>
  )
}
