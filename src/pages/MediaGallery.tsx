import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase, type Message } from '../lib/supabase'
import { useDecrypted } from '../lib/e2ee'
import { readCache, writeCache } from '../lib/network'
import { Screen } from '../components/Layout'
import { BackButton } from '../components/BackButton'
import { Photo, Lightbox } from '../components/Photo'
import type { PhotoRef } from '../lib/media'

/** Toutes les photos d'une conversation (déchiffrées sur le téléphone) */
export default function MediaGallery() {
  const { id = '' } = useParams()
  const [rows, setRows] = useState<Message[]>(() => readCache<Message[]>(`media:${id}`, []))
  const [loaded, setLoaded] = useState(false)
  const [view, setView] = useState<PhotoRef | null>(null)
  useEffect(() => {
    supabase.from('messages').select('*').eq('conversation_id', id).eq('has_media', true)
      .order('created_at', { ascending: false }).limit(500)
      .then(({ data }) => { if (data) { setRows(data as Message[]); writeCache(`media:${id}`, data) } setLoaded(true) })
  }, [id])
  const plainOf = useDecrypted(rows)
  const photos = rows.map((m) => plainOf(m)?.photo).filter((p): p is PhotoRef => !!p)

  return (
    <Screen header={<><BackButton to={`/c/${id}/settings`} /><h1>Médias</h1><span className="icon-btn" /></>}>
      {loaded && !photos.length && <p className="empty">Aucune photo dans cette conversation pour l'instant.</p>}
      <div className="media-grid">
        {photos.map((p) => <Photo key={p.path} photo={p} square onOpen={() => setView(p)} />)}
      </div>
      <Lightbox photo={view} onClose={() => setView(null)} />
    </Screen>
  )
}
