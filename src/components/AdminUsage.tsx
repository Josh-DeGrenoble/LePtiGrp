import { useEffect, useState } from 'react'
import { SGroup } from './SettingsRow'
import { supabase } from '../lib/supabase'

type Usage = { db_bytes: number; db_limit: number; storage_bytes: number; storage_limit: number }
const mo = (b: number) => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Go` : `${Math.round(b / 1024 ** 2)} Mo`)

/** Admin seulement : remplissage de la base et du stockage (alerte push à chaque palier de 10 %) */
export function AdminUsage() {
  const [u, setU] = useState<Usage | null>(null)
  useEffect(() => { supabase.rpc('app_usage').then(({ data }) => { if (data?.[0]) setU(data[0] as Usage) }) }, [])
  if (!u) return null
  return (
    <SGroup title="Serveur" note="Tu reçois une notification à chaque palier de 10 %.">
      <Gauge label="Base de données" used={u.db_bytes} limit={u.db_limit} />
      <Gauge label="Fichiers (photos, médias)" used={u.storage_bytes} limit={u.storage_limit} />
    </SGroup>
  )
}

function Gauge({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = Math.min(100, (100 * used) / limit)
  return (
    <div className="srow gauge">
      <div className="gauge-top"><span>{label}</span><b className={pct >= 80 ? 'danger' : ''}>{pct < 1 ? pct.toFixed(1) : Math.round(pct)} %</b></div>
      <div className="gauge-bar"><span className={pct >= 80 ? 'hot' : ''} style={{ width: `${Math.max(pct, 1)}%` }} /></div>
      <small className="muted">{mo(used)} sur {mo(limit)}</small>
    </div>
  )
}
