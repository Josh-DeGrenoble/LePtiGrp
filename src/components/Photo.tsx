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

/** Une photo de la visionneuse : nette dès qu'elle est déchiffrée */
function Slide({ photo }: { photo: PhotoRef | undefined }) {
  const [url, setUrl] = useState<string | null>(() => (photo ? cachedPhoto(photo) ?? null : null))
  useEffect(() => {
    if (!photo) return
    let alive = true
    setUrl(cachedPhoto(photo) ?? null)
    photoUrl(photo).then((u) => alive && setUrl(u)).catch(() => {})
    return () => { alive = false }
  }, [photo?.path]) // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="lb-slide">{photo && <img src={url ?? photo.th} className={url ? '' : 'blur'} alt="" draggable={false} onClick={(e) => e.stopPropagation()} />}</div>
}

const EASE = 'transform .32s cubic-bezier(.22,.8,.3,1)'

/**
 * Plein écran. Avec `photos` : carrousel, la photo suit le doigt (voisines visibles), passe à la suivante
 * au-delà d'un tiers de l'écran ou d'un geste vif, sinon revient en place. Flèches du clavier aussi.
 */
export function Lightbox({ photo, photos, onClose }: { photo: PhotoRef | null; photos?: PhotoRef[]; onClose: () => void }) {
  const list = photos?.length ? photos : photo ? [photo] : []
  const [idx, setIdx] = useState(0)
  const [dx, setDx] = useState(0)
  const [anim, setAnim] = useState(false)  // transition en cours (glissement fini ou retour en place)
  const touch = useRef<{ x: number; y: number; t: number; dir: 'h' | 'v' | null } | null>(null)
  const pending = useRef(0)  // -1 / +1 : changement de photo à faire à la fin de l'animation
  useEffect(() => {
    if (photo) { setIdx(Math.max(0, list.findIndex((p) => p.path === photo.path))); setDx(0); setAnim(false) }
  }, [photo]) // eslint-disable-line react-hooks/exhaustive-deps

  const w = () => window.innerWidth
  const slide = (d: number) => {
    const target = idx + d
    if (d && (target < 0 || target >= list.length)) d = 0
    pending.current = d
    setAnim(true); setDx(d ? -d * w() : 0)
  }
  const done = () => {
    if (!anim) return
    const d = pending.current
    pending.current = 0
    if (d) setIdx((i) => i + d)
    setAnim(false); setDx(0)
  }
  useEffect(() => {
    if (!photo) return
    const k = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') slide(1)
      if (e.key === 'ArrowLeft') slide(-1)
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }) // eslint-disable-line react-hooks/exhaustive-deps
  if (!photo || !list.length) return null

  const onTouchStart = (e: React.TouchEvent) => {
    if (anim || e.touches.length > 1) return
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, t: Date.now(), dir: null }
  }
  const onTouchMove = (e: React.TouchEvent) => {
    const t = touch.current
    if (!t || e.touches.length > 1) return
    const x = e.touches[0].clientX - t.x, y = e.touches[0].clientY - t.y
    if (!t.dir) { if (Math.hypot(x, y) < 10) return; t.dir = Math.abs(x) > Math.abs(y) * 1.2 ? 'h' : 'v' }
    if (t.dir !== 'h') return
    // au bord de la liste : résistance élastique
    const edge = (x > 0 && idx === 0) || (x < 0 && idx === list.length - 1)
    setDx(edge ? x * 0.25 : x)
  }
  const onTouchEnd = () => {
    const t = touch.current
    touch.current = null
    if (!t || t.dir !== 'h') return
    const speed = Math.abs(dx) / Math.max(1, Date.now() - t.t)  // px/ms
    const far = Math.abs(dx) > w() * 0.33 || (speed > 0.6 && Math.abs(dx) > 50)
    slide(far ? (dx < 0 ? 1 : -1) : 0)
  }

  const track = { transform: `translateX(calc(-100% + ${dx}px))`, transition: anim ? EASE : 'none' }
  return (
    <div className="lightbox" onClick={onClose} onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}>
      <div className="lb-track" style={track} onTransitionEnd={done}>
        {[idx - 1, idx, idx + 1].map((i) => <Slide key={list[i]?.path ?? `vide${i - idx}`} photo={list[i]} />)}
      </div>
      <button className="pe-btn lb-close" onClick={onClose} aria-label="Fermer"><IconClose size={22} /></button>
      {list.length > 1 && <>
        {idx > 0 && <button className="pe-btn lb-nav prev" onClick={(e) => { e.stopPropagation(); slide(-1) }} aria-label="Photo précédente"><IconBack size={22} /></button>}
        {idx < list.length - 1 && <button className="pe-btn lb-nav next" onClick={(e) => { e.stopPropagation(); slide(1) }} aria-label="Photo suivante"><IconBack size={22} /></button>}
        <div className="lb-count">{idx + 1} / {list.length}</div>
      </>}
    </div>
  )
}
