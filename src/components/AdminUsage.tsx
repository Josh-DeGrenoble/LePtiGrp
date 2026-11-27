import { useEffect, useState } from 'react'
import { SGroup } from './SettingsRow'
import { supabase } from '../lib/supabase'

type Usage = { db_bytes: number; db_limit: number; storage_bytes: number; storage_limit: number }
const mo = (b: number) => b >= 1024 ** 3 ? `${(b / 1024 ** 3).toLocaleString('fr-FR', { maximumFractionDigits: 2 })} Go`
  : b >= 1024 ** 2 ? `${(b / 1024 ** 2).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo` : `${Math.round(b / 1024)} Ko`

/** Admin seulement : remplissage de la base et du stockage (alerte push à chaque palier de 10 %) */
export function AdminUsage() {
  const [u, setU] = useState<Usage | null>(null)
  useEffect(() => { supabase.rpc('app_usage').then(({ data }) => { if (data?.[0]) setU(data[0] as Usage) }) }, [])
  if (!u) return null
  return (
    <SGroup title="Serveur" note={`Mesuré à l'ouverture (${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}). La base grossit très lentement : quelques Ko par jour. Notification à chaque palier de 10 %.`}>
      <Gauge label="Base de données" used={u.db_bytes} limit={u.db_limit} />
      <Gauge label="Fichiers (photos, médias)" used={u.storage_bytes} limit={u.storage_limit} />
    </SGroup>
  )
}

function Gauge({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = Math.min(100, (100 * used) / limit)
  return (
    <div className="srow gauge">
      <div className="gauge-top"><span>{label}</span><b className={pct >= 80 ? 'danger' : ''}>{(pct < 10 ? pct.toFixed(2) : Math.round(pct)).toString().replace('.', ',')} %</b></div>
      <div className="gauge-bar"><span className={pct >= 80 ? 'hot' : ''} style={{ width: `${Math.max(pct, 1)}%` }} /></div>
      <small className="muted">{mo(used)} sur {mo(limit)}</small>
    </div>
  )
}
