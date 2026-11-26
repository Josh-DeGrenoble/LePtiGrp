import { useEffect, useRef, useState } from 'react'
import { fitSize, loadImage } from '../lib/media'
import { IconClose, IconSend } from './Icons'

type Pt = { x: number; y: number }
type Stroke = { color: string; width: number; pts: Pt[] }
type Txt = { id: number; text: string; x: number; y: number; color: string }
type Op = { kind: 'stroke' } | { kind: 'text'; id: number }

const COLORS = ['#ffffff', '#111111', '#ef4444', '#f59e0b', '#22c55e', '#2563eb', '#a855f7']

/**
 * Retouche avant envoi, façon Snapchat : dessin au doigt, textes déplaçables, légende.
 * Le rendu se fait directement à la taille d'envoi (1600 px max).
 */
export function PhotoEditor({ file, onCancel, onSend }: {
  file: Blob; onCancel: () => void; onSend: (canvas: HTMLCanvasElement, caption: string) => Promise<void>
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [err, setErr] = useState('')
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [texts, setTexts] = useState<Txt[]>([])
  const [ops, setOps] = useState<Op[]>([])
  const [mode, setMode] = useState<'move' | 'draw'>('move')
  const [color, setColor] = useState(COLORS[2])
  const [typing, setTyping] = useState<string | null>(null)
  const [caption, setCaption] = useState('')
  const [busy, setBusy] = useState(false)
  const drag = useRef<{ id: number; dx: number; dy: number } | null>(null)
  const live = useRef<Stroke | null>(null)

  useEffect(() => { loadImage(file).then(setImg, () => setErr('Impossible de lire cette image.')) }, [file])

  const size = img ? fitSize(img.naturalWidth, img.naturalHeight) : { w: 1, h: 1 }
  const fontPx = Math.round(size.w * 0.075)

  // Dessin complet (image + traits + textes)
  const render = () => {
    const c = canvas.current
    if (!c || !img) return
    const g = c.getContext('2d')!
    g.drawImage(img, 0, 0, c.width, c.height)
    g.lineCap = 'round'; g.lineJoin = 'round'
    for (const s of [...strokes, ...(live.current ? [live.current] : [])]) {
      g.strokeStyle = s.color; g.lineWidth = s.width
      g.beginPath()
      s.pts.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y)))
      if (s.pts.length === 1) g.lineTo(s.pts[0].x + 0.1, s.pts[0].y)
      g.stroke()
    }
    g.font = `700 ${fontPx}px system-ui, sans-serif`
    g.textAlign = 'center'; g.textBaseline = 'middle'
    for (const t of texts) {
      g.lineWidth = fontPx / 7; g.strokeStyle = t.color === '#111111' ? '#ffffff' : '#000000'
      g.strokeText(t.text, t.x, t.y)
      g.fillStyle = t.color; g.fillText(t.text, t.x, t.y)
    }
  }
  useEffect(render)

  const toCanvas = (e: React.PointerEvent): Pt => {
    const r = canvas.current!.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * size.w, y: ((e.clientY - r.top) / r.height) * size.h }
  }
  const hitText = (p: Pt) => {
    const g = canvas.current!.getContext('2d')!
    g.font = `700 ${fontPx}px system-ui, sans-serif`
    return [...texts].reverse().find((t) => Math.abs(p.x - t.x) < g.measureText(t.text).width / 2 + 20 && Math.abs(p.y - t.y) < fontPx)
  }

  const down = (e: React.PointerEvent) => {
    (e.target as Element).setPointerCapture(e.pointerId)
    const p = toCanvas(e)
    if (mode === 'draw') { live.current = { color, width: Math.max(4, size.w / 120), pts: [p] }; render(); return }
    const t = hitText(p)
    if (t) drag.current = { id: t.id, dx: p.x - t.x, dy: p.y - t.y }
  }
  const move = (e: React.PointerEvent) => {
    const p = toCanvas(e)
    if (live.current) { live.current.pts.push(p); render(); return }
    const d = drag.current
    if (d) setTexts((ts) => ts.map((t) => (t.id === d.id ? { ...t, x: p.x - d.dx, y: p.y - d.dy } : t)))
  }
  const up = () => {
    if (live.current) { const s = live.current; live.current = null; setStrokes((x) => [...x, s]); setOps((o) => [...o, { kind: 'stroke' }]) }
    drag.current = null
  }

  const addText = () => {
    const v = typing?.trim()
    if (v) {
      const id = Date.now()
      setTexts((ts) => [...ts, { id, text: v, x: size.w / 2, y: size.h / 2, color }])
      setOps((o) => [...o, { kind: 'text', id }])
    }
    setTyping(null); setMode('move')
  }
  const undo = () => {
    const last = ops.at(-1)
    if (!last) return
    if (last.kind === 'stroke') setStrokes((s) => s.slice(0, -1))
    else setTexts((ts) => ts.filter((t) => t.id !== last.id))
    setOps((o) => o.slice(0, -1))
  }
  const send = async () => {
    if (!canvas.current) return
    setBusy(true); setErr('')
    try { await onSend(canvas.current, caption.trim()) } catch (e) { setErr((e as Error).message ?? String(e)); setBusy(false) }
  }

  return (
    <div className="photo-editor">
      <div className="pe-top">
        <button className="pe-btn" onClick={onCancel} aria-label="Annuler"><IconClose size={22} /></button>
        <span className="pe-spacer" />
        <button className="pe-btn" onClick={undo} disabled={!ops.length} aria-label="Annuler la dernière retouche">↶</button>
        <button className={`pe-btn${mode === 'draw' ? ' on' : ''}`} onClick={() => setMode(mode === 'draw' ? 'move' : 'draw')} aria-label="Dessiner">✏️</button>
        <button className="pe-btn" onClick={() => setTyping('')} aria-label="Ajouter du texte">Aa</button>
      </div>
      {(mode === 'draw' || typing !== null) && <div className="pe-colors">
        {COLORS.map((c) => <button key={c} className={`pe-color${c === color ? ' on' : ''}`} style={{ background: c }} onClick={() => setColor(c)} aria-label={`Couleur ${c}`} />)}
      </div>}
      <div className="pe-stage">
        {err && !img ? <p className="pe-error">{err}</p> : img
          ? <canvas ref={canvas} width={size.w} height={size.h} className={mode === 'draw' ? 'drawing' : ''}
              onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
          : <span className="spinner" />}
      </div>
      {typing !== null && <div className="pe-typing">
        <input autoFocus value={typing} maxLength={60} onChange={(e) => setTyping(e.target.value)} placeholder="Ton texte…"
          style={{ color }} onKeyDown={(e) => { if (e.key === 'Enter') addText() }} />
        <button className="btn primary" onClick={addText}>OK</button>
      </div>}
      {mode === 'move' && texts.length > 0 && typing === null && <p className="pe-hint">Fais glisser un texte pour le déplacer</p>}
      <div className="pe-bottom">
        {err && img && <p className="pe-error">{err}</p>}
        <div className="composer">
          <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="Ajouter une légende…" maxLength={1000} />
          <button className="send" onClick={send} disabled={busy || !img} aria-label="Envoyer la photo">{busy ? <span className="spinner" /> : <IconSend />}</button>
        </div>
      </div>
    </div>
  )
}
