import { Toggle } from './Sheet'

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
