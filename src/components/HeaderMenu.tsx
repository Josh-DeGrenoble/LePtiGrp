import { useRef, useState, type CSSProperties } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { IconBell, IconDown, IconPlus } from './Icons'
import { ReminderSheet } from './ReminderSheet'
import { ToolIcon } from './ToolIcon'
import { TOOLS, cachedTools, loadTools, type ToolItem, type ToolKind } from '../lib/tools'

const KINDS: ToolKind[] = ['notes', 'accounts', 'polls']

/**
 * Flèche ▽ de l'en-tête : menu des outils (pense-bête, comptes, sondage, rappel).
 * Dans une conversation (`convId`), chaque outil liste aussi ses éléments liés à la conv, et « Nouveau » ouvre la création déjà liée à la conv.
 */
export function HeaderMenu({ convId }: { convId?: string }) {
  const nav = useNavigate()
  const { pathname, state } = useLocation()
  const btn = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState<CSSProperties | null>(null)
  const [linked, setLinked] = useState<Partial<Record<ToolKind, ToolItem[]>>>({})
  const [reminder, setReminder] = useState(false)

  const open = () => {
    const r = btn.current!.getBoundingClientRect()
    setPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right - 8) })
    if (!convId) return
    for (const k of KINDS) {
      const set = (all: ToolItem[]) => setLinked((l) => ({ ...l, [k]: all.filter((i) => i.conversation_id === convId) }))
      set(cachedTools(k))
      loadTools(k).then(set).catch(() => {})
    }
  }
  const close = () => setPos(null)
  // Les outils sont des pages sœurs : passer de l'un à l'autre remplace la page (pas d'empilement)
  // et le retour ramène toujours à la page d'origine (la conv, ou la liste des convs)
  const inTool = /^\/(notes|accounts|polls)(\/|$)/.test(pathname)
  const root = inTool ? (state as { root?: string } | null)?.root ?? '/' : pathname
  const go = (to: string) => { close(); nav(to, { replace: inTool, state: { from: root, root } }) }

  return <>
    <button ref={btn} className={`icon-btn hmenu-btn${pos ? ' on' : ''}`} onClick={() => (pos ? close() : open())}
      aria-label="Outils" aria-expanded={!!pos}><IconDown /></button>
    {pos && <>
      <div className="hmenu-backdrop" onClick={close} />
      <div className="hmenu" style={pos} role="menu">
        {KINDS.map((k) => <div key={k} className="hmenu-group">
          <button className="hmenu-item" onClick={() => go(`/${k}`)}><ToolIcon kind={k} /><span>{TOOLS[k].label}</span></button>
          {convId && <div className="hmenu-sub">
            {(linked[k] ?? []).map((i) => (
              <button key={i.id} className="hmenu-subitem" onClick={() => go(`/${k}/${i.id}`)}><span>{i.title}</span></button>
            ))}
            <button className="hmenu-subitem hmenu-new" onClick={() => go(`/${k}/new?conv=${convId}`)}><IconPlus size={18} /><span>Nouveau</span></button>
          </div>}
        </div>)}
        <button className="hmenu-item" onClick={() => { close(); setReminder(true) }}><IconBell /><span>Rappel</span></button>
      </div>
    </>}
    <ReminderSheet open={reminder} onClose={() => setReminder(false)} convId={convId} />
  </>
}
