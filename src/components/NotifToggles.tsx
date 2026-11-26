import { Toggle } from './Sheet'
import { useAuth } from '../lib/auth'
import type { ToolKey } from '../lib/supabase'

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

export type ActivityPrefs = { show_tools?: ToolKey[] | null; notify_activity?: boolean | null }
export const TOOL_LABELS: [ToolKey, string][] = [['list', 'Pense-bêtes'], ['poll', 'Sondages'], ['ledger', 'Comptes']]

/** Modifs des pense-bêtes, sondages et comptes de la conv : lesquelles voir dans le chat, en être notifié.
 *  Non réglé pour la conv = réglage par défaut (Paramètres). */
export function ActivityToggles({ prefs, onChange }: { prefs: ActivityPrefs; onChange: (patch: ActivityPrefs) => void }) {
  const { profile } = useAuth()
  const show = prefs.show_tools ?? profile?.show_tools_default ?? []
  const notif = prefs.notify_activity ?? profile?.notify_activity_default ?? true
  return <>
    {TOOL_LABELS.map(([k, label]) => (
      <Toggle key={k} label={`${label} dans le chat`} checked={show.includes(k)}
        onChange={(v) => onChange({ show_tools: v ? [...show, k] : show.filter((x) => x !== k) })} />
    ))}
    <Toggle label="Me notifier" checked={notif} onChange={(v) => onChange({ notify_activity: v })} />
  </>
}
