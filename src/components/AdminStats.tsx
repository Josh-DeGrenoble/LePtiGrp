import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type Stats = Record<string, number | null> & { per_day?: number[] }
const fr = (n: number | null | undefined) => (n ?? 0).toLocaleString('fr-FR')

/** Admin seulement : chiffres clés de l'appli (compteurs, jamais de contenu) — RPC app_stats (supabase/stats.sql) */
export function AdminStats() {
  const [s, setS] = useState<Stats | null>(null)
  const [missing, setMissing] = useState(false)
  useEffect(() => {
    supabase.rpc('app_stats').then(({ data, error }) => { if (error) setMissing(true); else setS(data as Stats) })
  }, [])
  if (missing) return <p className="muted small help">Statistiques indisponibles : lance supabase/stats.sql.</p>
  if (!s) return null
  const days = (s.per_day ?? []) as number[]
  const max = Math.max(1, ...days)
  const Tile = ({ n, label, sub }: { n: number | string | null | undefined; label: string; sub?: string }) => (
    <div className="stat-tile"><b>{typeof n === 'string' ? n : fr(n)}</b><span>{label}</span>{sub && <small>{sub}</small>}</div>
  )
  return <>
    <section className="sgroup">
      <h2 className="sgroup-title">Utilisateurs</h2>
      <div className="stat-grid">
        <Tile n={s.users} label="comptes" sub={`+${fr(s.users_new_7d)} cette semaine`} />
        <Tile n={s.writers_7d} label="actifs 7 j" sub={`${fr(s.writers_30d)} sur 30 j`} />
        <Tile n={s.active_1d} label="connectés 24 h" />
        <Tile n={s.push_users} label="avec notifs" />
        <Tile n={s.friendships} label="amitiés" sub={`${fr(s.circles)} cercles`} />
        <Tile n={s.users_deleted} label="comptes supprimés" />
      </div>
    </section>
    <section className="sgroup">
      <h2 className="sgroup-title">Discussions</h2>
      <div className="stat-grid">
        <Tile n={s.messages} label="messages" sub={`${fr(s.messages_24h)} en 24 h · ${fr(s.messages_7d)} en 7 j`} />
        <Tile n={s.groups} label="groupes" sub={s.avg_group_size ? `${String(s.avg_group_size).replace('.', ',')} membres en moyenne · max ${s.biggest_group}` : undefined} />
        <Tile n={s.dms} label="convs à deux" />
        <Tile n={s.photos} label="photos" />
        <Tile n={s.reactions} label="réactions" sub={`${fr(s.pinned)} épinglés en cours`} />
        <Tile n={s.activity} label="modifs d'outils" />
      </div>
      {days.length > 0 && <div className="stat-chart" aria-label="Messages par jour sur 14 jours">
        {days.map((n, i) => <span key={i} title={`${n} message${n > 1 ? 's' : ''}`}><i style={{ height: `${Math.max(3, (100 * n) / max)}%` }} /></span>)}
      </div>}
      {days.length > 0 && <div className="sgroup-note">Messages par jour, 14 derniers jours (max {fr(max)}).</div>}
    </section>
    <section className="sgroup">
      <h2 className="sgroup-title">Outils</h2>
      <div className="stat-grid">
        <Tile n={s.lists} label="pense-bêtes" sub={`${fr(s.list_items)} éléments`} />
        <Tile n={s.ledgers} label="comptes" sub={`${fr(s.expenses)} dépenses`} />
        <Tile n={s.polls} label="sondages" sub={`${fr(s.votes)} votes`} />
        <Tile n={s.events} label="événements" sub={`${fr(s.events_coming)} à venir`} />
        <Tile n={s.reminders} label="rappels en attente" />
        <Tile n={s.feedback} label="retours reçus" />
      </div>
    </section>
  </>
}
