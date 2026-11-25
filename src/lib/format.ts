const pad = (n: number) => String(n).padStart(2, '0')
export const hhmm = (d: Date) => `${pad(d.getHours())}h${pad(d.getMinutes())}`

function dayDiff(d: Date, now = new Date()) {
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const b = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  return Math.round((b - a) / 86400000)
}

/** Liste des convs : "12h55", "Hier", "Avant hier", "lun.", "12/03" */
export function shortDate(iso: string) {
  const d = new Date(iso)
  const diff = dayDiff(d)
  if (diff === 0) return hhmm(d)
  if (diff === 1) return 'Hier'
  if (diff === 2) return 'Avant hier'
  if (diff < 7) return d.toLocaleDateString('fr-FR', { weekday: 'short' })
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`
}

/** Messages : "12h55", "Hier 17h12", "Avant hier 20h37", "12/03 20h37" */
export function messageDate(iso: string) {
  const d = new Date(iso)
  const diff = dayDiff(d)
  if (diff === 0) return hhmm(d)
  if (diff === 1) return `Hier ${hhmm(d)}`
  if (diff === 2) return `Avant hier ${hhmm(d)}`
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${hhmm(d)}`
}

/** Temps restant d'un épinglage : "2j", "4h", "12min", "--" (sans limite) */
export function remaining(until: string | null) {
  if (!until) return '--'
  const ms = new Date(until).getTime() - Date.now()
  if (ms <= 0) return ''
  const min = Math.ceil(ms / 60000)
  if (min < 60) return `${min}min`
  const h = Math.round(min / 60)
  if (h < 24) return `${h}h`
  return `${Math.round(h / 24)}j`
}
