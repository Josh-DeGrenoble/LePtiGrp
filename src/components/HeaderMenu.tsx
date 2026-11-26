import { useRef, useState, type CSSProperties } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { IconBell, IconDown, IconPlus } from './Icons'
import { LimitedInput } from './LimitedInput'
import { ReminderSheet } from './ReminderSheet'
import { ToolIcon } from './ToolIcon'
import { notify } from './Dialog'
import { errMsg } from '../lib/supabase'
import { useMe } from '../lib/auth'
import { TOOLS, cachedTools, createTool, loadTools, type ToolItem, type ToolKind } from '../lib/tools'

const KINDS: ToolKind[] = ['notes', 'accounts', 'polls']

/**
 * Flèche ▽ de l'en-tête : menu des outils (pense-bête, comptes, sondage, rappel).
 * Dans une conversation (`convId`), chaque outil liste aussi ses éléments liés à la conv, avec un champ « Nouveau… ».
 */
export function HeaderMenu({ convId }: { convId?: string }) {
  const me = useMe()
  const nav = useNavigate()
  const { pathname } = useLocation()
  const btn = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState<CSSProperties | null>(null)
  const [linked, setLinked] = useState<Partial<Record<ToolKind, ToolItem[]>>>({})
  const [names, setNames] = useState<Partial<Record<ToolKind, string>>>({})
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
  const close = () => { setPos(null); setNames({}) }
  // Le retour depuis la page ouverte ramène ici
  const go = (to: string) => { close(); nav(to, { state: { from: pathname } }) }

  const create = async (e: React.FormEvent, k: ToolKind) => {
    e.preventDefault()
    const name = names[k]?.trim()
    if (!name || !convId) return
    // un sondage a besoin de ses réponses : on passe par la page de création, pré-remplie
    if (k === 'polls') return go(`/polls/new?conv=${convId}&q=${encodeURIComponent(name)}`)
    try { go(`/${k}/${(await createTool(k, { name }, { mode: 'conv', conv: convId, ids: [] }, me)).id}`) } catch (err) { notify(errMsg(err)) }
  }

  return <>
    <button ref={btn} className={`icon-btn hmenu-btn${pos ? ' on' : ''}`} onClick={() => (pos ? close() : open())}
      aria-label="Outils" aria-expanded={!!pos}><IconDown /></button>
    {pos && <>
      <div className="hmenu-backdrop" onClick={close} />
      <div className="hmenu" style={pos} role="menu">
        {KINDS.map((k) => <div key={k}>
          <button className="hmenu-item" onClick={() => go(`/${k}`)}><ToolIcon kind={k} /><span>{TOOLS[k].label}</span></button>
          {convId && <div className="hmenu-sub">
            {(linked[k] ?? []).map((i) => (
              <button key={i.id} className="hmenu-subitem" onClick={() => go(`/${k}/${i.id}`)}><span>{i.title}</span></button>
            ))}
            <form className="hmenu-new" onSubmit={(e) => create(e, k)}>
              <LimitedInput max={k === 'polls' ? 200 : 40} placeholder="Nouveau…" value={names[k] ?? ''} onChange={(e) => setNames((n) => ({ ...n, [k]: e.target.value }))} />
              <button className="icon-btn" disabled={!names[k]?.trim()} aria-label="Créer"><IconPlus size={20} /></button>
            </form>
          </div>}
        </div>)}
        <button className="hmenu-item" onClick={() => { close(); setReminder(true) }}><IconBell /><span>Notification</span></button>
      </div>
    </>}
    <ReminderSheet open={reminder} onClose={() => setReminder(false)} convId={convId} />
  </>
}
