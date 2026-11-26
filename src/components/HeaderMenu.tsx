import { useRef, useState, type CSSProperties } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { IconBell, IconDown, IconList, IconMoney, IconPlus, IconPoll } from './Icons'
import { LimitedInput } from './LimitedInput'
import { ReminderSheet } from './ReminderSheet'
import { notify } from './Dialog'
import { cachedLists, createList, loadLists, type ListSummary } from '../lib/lists'
import { errMsg } from '../lib/supabase'

/**
 * Flèche ▽ de l'en-tête : menu des outils (pense-bête, comptes, sondage, rappel).
 * Dans une conversation (`convId`), il liste aussi les pense-bêtes partagés avec elle.
 */
export function HeaderMenu({ convId }: { convId?: string }) {
  const nav = useNavigate()
  const { pathname } = useLocation()
  const btn = useRef<HTMLButtonElement>(null)
  const [pos, setPos] = useState<CSSProperties | null>(null)
  const [lists, setLists] = useState<ListSummary[]>([])
  const [name, setName] = useState('')
  const [reminder, setReminder] = useState(false)

  const linked = (all: ListSummary[]) => all.filter((l) => l.conversation_id === convId)
  const open = () => {
    const r = btn.current!.getBoundingClientRect()
    setPos({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right - 8) })
    if (convId) {
      setLists(linked(cachedLists()))
      loadLists().then((all) => setLists(linked(all))).catch(() => {})
    }
  }
  const close = () => { setPos(null); setName('') }
  // Le retour depuis un pense-bête ramène ici
  const go = (to: string) => { close(); nav(to, { state: { from: pathname } }) }

  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !convId) return
    try { go(`/notes/${(await createList(name, convId)).id}`) } catch (err) { notify(errMsg(err)) }
  }

  return <>
    <button ref={btn} className={`icon-btn hmenu-btn${pos ? ' on' : ''}`} onClick={() => (pos ? close() : open())}
      aria-label="Outils" aria-expanded={!!pos}><IconDown /></button>
    {pos && <>
      <div className="hmenu-backdrop" onClick={close} />
      <div className="hmenu" style={pos} role="menu">
        <button className="hmenu-item" onClick={() => go('/notes')}><IconList /><span>Pense-bête</span></button>
        {convId && <div className="hmenu-sub">
          {lists.map((l) => (
            <button key={l.id} className="hmenu-subitem" onClick={() => go(`/notes/${l.id}`)}>
              <span>{l.name}</span>{l.left > 0 && <small>{l.left}</small>}
            </button>
          ))}
          <form className="hmenu-new" onSubmit={create}>
            <LimitedInput max={40} placeholder="Nouveau…" value={name} onChange={(e) => setName(e.target.value)} />
            <button className="icon-btn" disabled={!name.trim()} aria-label="Créer"><IconPlus size={20} /></button>
          </form>
        </div>}
        <button className="hmenu-item" disabled><IconMoney size={22} /><span>Comptes</span><small>Bientôt</small></button>
        <button className="hmenu-item" disabled><IconPoll /><span>Sondage</span><small>Bientôt</small></button>
        <button className="hmenu-item" onClick={() => { close(); setReminder(true) }}><IconBell /><span>Notification</span></button>
      </div>
    </>}
    <ReminderSheet open={reminder} onClose={() => setReminder(false)} convId={convId} />
  </>
}
