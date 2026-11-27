import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SGroup, SRow } from './SettingsRow'
import { ToolIcon } from './ToolIcon'
import { TOOLS, cachedTools, loadTools, type ToolItem, type ToolKind } from '../lib/tools'

const KINDS: ToolKind[] = ['notes', 'accounts', 'polls', 'calendar']

/** Paramètres d'une conv : tous les outils qui lui sont rattachés (pense-bêtes, comptes, sondages, événements) */
export function LinkedTools({ convId }: { convId: string }) {
  const nav = useNavigate()
  const pick = () => Object.fromEntries(KINDS.map((k) => [k, cachedTools(k).filter((i) => i.conversation_id === convId)])) as Record<ToolKind, ToolItem[]>
  const [items, setItems] = useState(pick)
  useEffect(() => {
    for (const k of KINDS) loadTools(k).then((all) => setItems((x) => ({ ...x, [k]: all.filter((i) => i.conversation_id === convId) }))).catch(() => {})
  }, [convId])

  const total = KINDS.reduce((n, k) => n + items[k].length, 0)
  return (
    <SGroup title={`Outils de la conversation (${total})`}>
      {total === 0 && <p className="muted small help">Aucun pour l'instant : crée-en un depuis le menu ▽ du chat.</p>}
      {KINDS.flatMap((k) => items[k].map((i) => (
        <SRow key={i.id} icon={<ToolIcon kind={k} size={18} />} label={i.title} sub={`${TOOLS[k].label} · ${i.summary}`}
          onClick={() => nav(`/${k}/${i.id}`, { state: { from: `/c/${convId}/settings`, root: `/c/${convId}/settings` } })} />
      )))}
    </SGroup>
  )
}
