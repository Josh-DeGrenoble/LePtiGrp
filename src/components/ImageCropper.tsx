import { useEffect, useRef, useState } from 'react'

const VIEW = 260 // taille du cadre à l'écran
const OUT = 320 // taille de l'image finale

/** Recadrage carré : glisser pour déplacer, curseur (ou molette) pour zoomer */
export function ImageCropper({ file, onCancel, onDone }: { file: File; onCancel: () => void; onDone: (b: Blob) => void }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [zoom, setZoom] = useState(1)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const drag = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const url = URL.createObjectURL(file)
    const i = new Image()
    i.onload = () => {
      const b = VIEW / Math.min(i.width, i.height)
      setPos({ x: (VIEW - i.width * b) / 2, y: (VIEW - i.height * b) / 2 }) // centré
      setImg(i)
    }
    i.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])

  if (!img) return null
  const base = VIEW / Math.min(img.width, img.height) // échelle "remplit le cadre"
  const scale = base * zoom
  const w = img.width * scale, h = img.height * scale
  const clamp = (p: { x: number; y: number }) => ({
    x: Math.min(0, Math.max(VIEW - w, p.x)), y: Math.min(0, Math.max(VIEW - h, p.y)),
  })
  const p = clamp(pos)

  const setZoomCentered = (z: number) => {
    const nz = Math.min(4, Math.max(1, z))
    const k = nz / zoom
    setPos({ x: VIEW / 2 - (VIEW / 2 - p.x) * k, y: VIEW / 2 - (VIEW / 2 - p.y) * k })
    setZoom(nz)
  }

  const save = () => {
    const c = document.createElement('canvas')
    c.width = c.height = OUT
    const r = OUT / VIEW
    c.getContext('2d')!.drawImage(img, p.x * r, p.y * r, w * r, h * r)
    c.toBlob((b) => b && onDone(b), 'image/jpeg', 0.85)
  }

  return (
    <div className="cropper">
      <div className="crop-frame" data-no-swipe style={{ width: VIEW, height: VIEW }}
        onPointerDown={(e) => { e.currentTarget.setPointerCapture(e.pointerId); drag.current = { x: e.clientX - p.x, y: e.clientY - p.y } }}
        onPointerMove={(e) => drag.current && setPos({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y })}
        onPointerUp={() => { drag.current = null }}
        onWheel={(e) => setZoomCentered(zoom - e.deltaY / 500)}>
        <img src={img.src} alt="" draggable={false} style={{ width: w, height: h, transform: `translate(${p.x}px, ${p.y}px)` }} />
      </div>
      <input type="range" min={1} max={4} step={0.01} value={zoom} onChange={(e) => setZoomCentered(+e.target.value)} aria-label="Zoom" />
      <div className="dialog-actions">
        <button className="btn" onClick={onCancel}>Annuler</button>
        <button className="btn primary" onClick={save}>Valider</button>
      </div>
    </div>
  )
}
