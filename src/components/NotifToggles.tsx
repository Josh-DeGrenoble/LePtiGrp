import { Toggle } from './Sheet'
import { useAuth } from '../lib/auth'
import type { ToolKey } from '../lib/supabase'
import { ToolIcon } from './ToolIcon'

export type NotifPrefs = { notify_all: boolean; notify_mentions: boolean; notify_pins: boolean }

/** Réglages de notifications d'une conversation (appui long dans la liste et paramètres de la conv) */
export function NotifToggles({ prefs, onChange }: { prefs: NotifPrefs; onChange: (patch: Partial<NotifPrefs>) => void }) {
  return <>
    <Toggle label="Tous les messages" checked={prefs.notify_all} onChange={(v) => onChange({ notify_all: v })} />
    <Toggle label="Quand on me mentionne" checked={prefs.notify_all || prefs.notify_mentions} disabled={prefs.notify_all}
      onChange={(v) => onChange({ notify_mentions: v })} />
    <Toggle label="Quand un message est épinglé" checked={prefs.notify_pins} onChange={(v) => onChange({ notify_pins: v })} />
  </>
}

export type ActivityPrefs = { show_tools?: ToolKey[] | null; notify_tools?: ToolKey[] | null }
export const TOOL_LABELS: [ToolKey, string][] = [['list', 'Pense-bêtes'], ['poll', 'Sondages'], ['ledger', 'Comptes']]
export const ALL_TOOLS: ToolKey[] = ['list', 'poll', 'ledger']
const KIND = { list: 'notes', poll: 'polls', ledger: 'accounts' } as const

/** Une ligne par outil, avec deux cases : « Chat » (afficher ses modifs dans le chat) et « Notif » */
export function ToolPrefsGrid({ show, notify, onChange }: { show: ToolKey[]; notify: ToolKey[]; onChange: (patch: { show?: ToolKey[]; notify?: ToolKey[] }) => void }) {
  const flip = (arr: ToolKey[], k: ToolKey) => (arr.includes(k) ? arr.filter((x) => x !== k) : [...arr, k])
  return <div className="tool-prefs">
    {TOOL_LABELS.map(([k, label]) => (
      <div key={k} className="tool-pref">
        <span className="tool-pref-name"><ToolIcon kind={KIND[k]} size={18} />{label}</span>
        <button className={`pref-chip${show.includes(k) ? ' on' : ''}`} aria-pressed={show.includes(k)} onClick={() => onChange({ show: flip(show, k) })}>Chat</button>
        <button className={`pref-chip${notify.includes(k) ? ' on' : ''}`} aria-pressed={notify.includes(k)} onClick={() => onChange({ notify: flip(notify, k) })}>Notif</button>
      </div>
    ))}
  </div>
}

/** Modifs des outils de la conv. Non réglé pour la conv = réglage par défaut (Paramètres). */
export function ActivityToggles({ prefs, onChange }: { prefs: ActivityPrefs; onChange: (patch: ActivityPrefs) => void }) {
  const { profile } = useAuth()
  const show = prefs.show_tools ?? profile?.show_tools_default ?? []
  const notify = prefs.notify_tools ?? profile?.notify_tools_default ?? ALL_TOOLS
  return <ToolPrefsGrid show={show} notify={notify}
    onChange={(p) => onChange({ ...(p.show && { show_tools: p.show }), ...(p.notify && { notify_tools: p.notify }) })} />
}
