import { useEffect, useRef, useState } from 'react'
import { cachedPhoto, photoUrl, type PhotoRef } from '../lib/media'
import { IconBack, IconClose } from './Icons'

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

/** Plein écran. Avec `photos` : balayer à gauche / à droite (ou flèches du clavier) passe à la suivante / précédente */
export function Lightbox({ photo, photos, onClose }: { photo: PhotoRef | null; photos?: PhotoRef[]; onClose: () => void }) {
  const list = photos?.length ? photos : photo ? [photo] : []
  const [idx, setIdx] = useState(0)
  const [url, setUrl] = useState<string | null>(null)
  const [dx, setDx] = useState(0)
  const start = useRef<{ x: number; y: number } | null>(null)
  // ouverture : on se place sur la photo touchée
  useEffect(() => {
    if (photo) setIdx(Math.max(0, list.findIndex((p) => p.path === photo.path)))
  }, [photo]) // eslint-disable-line react-hooks/exhaustive-deps
  const cur = photo ? list[idx] ?? photo : null
  useEffect(() => {
    if (!cur) return setUrl(null)
    let alive = true
    setUrl(cachedPhoto(cur) ?? null)
    photoUrl(cur).then((u) => alive && setUrl(u))
    // voisines préchargées : le passage de l'une à l'autre est immédiat
    for (const n of [list[idx - 1], list[idx + 1]]) if (n && !cachedPhoto(n)) photoUrl(n).catch(() => {})
    return () => { alive = false }
  }, [cur?.path]) // eslint-disable-line react-hooks/exhaustive-deps
  const go = (d: number) => setIdx((i) => Math.min(list.length - 1, Math.max(0, i + d)))
  useEffect(() => {
    if (!photo) return
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') go(1)
      if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [photo, onClose, list.length]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!photo || !cur) return null

  const onTouchStart = (e: React.TouchEvent) => { start.current = { x: e.touches[0].clientX, y: e.touches[0].clientY } }
  const onTouchMove = (e: React.TouchEvent) => {
    if (!start.current || e.touches.length > 1) return
    const x = e.touches[0].clientX - start.current.x
    if (Math.abs(x) > Math.abs(e.touches[0].clientY - start.current.y)) setDx(x)
  }
  const onTouchEnd = () => {
    // seuil : un quart de l'écran ou 60 px ; au bord de la liste, la photo revient en place
    if (Math.abs(dx) > Math.min(60, window.innerWidth / 4)) go(dx < 0 ? 1 : -1)
    setDx(0); start.current = null
  }

  return (
    <div className="lightbox" onClick={onClose} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}>
      <button className="pe-btn lb-close" onClick={onClose} aria-label="Fermer"><IconClose size={22} /></button>
      <img key={cur.path} src={url ?? cur.th} className={url ? '' : 'blur'} alt="" onClick={(e) => e.stopPropagation()}
        style={dx ? { transform: `translateX(${dx}px)`, transition: 'none' } : undefined} />
      {list.length > 1 && <>
        {idx > 0 && <button className="pe-btn lb-nav prev" onClick={(e) => { e.stopPropagation(); go(-1) }} aria-label="Photo précédente"><IconBack size={22} /></button>}
        {idx < list.length - 1 && <button className="pe-btn lb-nav next" onClick={(e) => { e.stopPropagation(); go(1) }} aria-label="Photo suivante"><IconBack size={22} /></button>}
        <div className="lb-count">{idx + 1} / {list.length}</div>
      </>}
    </div>
  )
}
