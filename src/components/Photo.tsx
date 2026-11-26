import { useEffect, useState } from 'react'
import { cachedPhoto, photoUrl, type PhotoRef } from '../lib/media'
import { IconClose } from './Icons'

/** Photo déchiffrée à la volée ; miniature floue en attendant */
export function Photo({ photo, onOpen, square }: { photo: PhotoRef; onOpen?: () => void; square?: boolean }) {
  const [url, setUrl] = useState(() => cachedPhoto(photo) ?? null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let alive = true
    if (!url) photoUrl(photo).then((u) => { if (!alive) return; if (u) setUrl(u); else setFailed(true) })
    return () => { alive = false }
  }, [photo, url])
  return (
    <button type="button" className={`photo${square ? ' square' : ''}`} onClick={(e) => { e.stopPropagation(); onOpen?.() }}
      style={square ? undefined : { aspectRatio: `${photo.w} / ${photo.h}` }} aria-label="Voir la photo">
      <img src={url ?? photo.th} className={url ? '' : 'blur'} alt="" draggable={false} />
      {failed && <span className="photo-failed">🔒 Photo indisponible</span>}
    </button>
  )
}

/** Plein écran */
export function Lightbox({ photo, onClose }: { photo: PhotoRef | null; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    setUrl(photo ? cachedPhoto(photo) ?? null : null)
    if (photo) photoUrl(photo).then(setUrl)
  }, [photo])
  useEffect(() => {
    if (!photo) return
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [photo, onClose])
  if (!photo) return null
  return (
    <div className="lightbox" onClick={onClose}>
      <button className="pe-btn lb-close" onClick={onClose} aria-label="Fermer"><IconClose size={22} /></button>
      <img src={url ?? photo.th} className={url ? '' : 'blur'} alt="" onClick={(e) => e.stopPropagation()} />
    </div>
  )
}
