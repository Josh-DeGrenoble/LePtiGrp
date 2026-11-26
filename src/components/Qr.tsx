import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import qrcode from 'qrcode-generator'
import { Sheet } from './Sheet'
import { IconScan, IconShare } from './Icons'

/** QR code en SVG (aucune requête réseau) */
export function QrCode({ text, size = 220 }: { text: string; size?: number }) {
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()
  const n = qr.getModuleCount()
  let d = ''
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + 2} ${r + 2}h1v1h-1z`
  return (
    <svg className="qr-code" width={size} height={size} viewBox={`0 0 ${n + 4} ${n + 4}`} shapeRendering="crispEdges" role="img" aria-label="QR code">
      <rect width={n + 4} height={n + 4} fill="#fff" /><path d={d} fill="#000" />
    </svg>
  )
}

/** Feuille « mon QR code » : le QR, partager / copier le lien, et scanner celui d'un ami */
export function QrSheet({ open, onClose, url, title, caption }: { open: boolean; onClose: () => void; url: string; title: string; caption?: string }) {
  const [scan, setScan] = useState(false)
  const [copied, setCopied] = useState(false)
  const share = async () => {
    if (navigator.share) { try { await navigator.share({ title: 'LePtiGrp', url }) } catch { /* annulé */ } return }
    await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000)
  }
  return <>
    <Sheet open={open && !scan} onClose={onClose} title={title}>
      <div className="qr-sheet">
        <QrCode text={url} />
        {caption && <p className="muted small center">{caption}</p>}
        <div className="qr-actions">
          <button className="btn" onClick={share}><IconShare size={18} /> {copied ? 'Lien copié ✓' : 'share' in navigator ? 'Partager le lien' : 'Copier le lien'}</button>
          <button className="btn primary" onClick={() => setScan(true)}><IconScan size={18} /> Scanner un QR code</button>
        </div>
      </div>
    </Sheet>
    <QrScanner open={scan} onClose={() => setScan(false)} />
  </>
}

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> }

/** Scanner : caméra arrière, BarcodeDetector si dispo (Chrome Android), sinon jsQR */
export function QrScanner({ open, onClose }: { open: boolean; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null)
  const nav = useNavigate()
  const [err, setErr] = useState('')
  const [found, setFound] = useState('')
  const close = useRef(onClose)
  close.current = onClose

  useEffect(() => {
    if (!open) return
    setErr(''); setFound('')
    let stream: MediaStream | null = null
    let stop = false
    let timer = 0
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!
    const handle = (text: string) => {
      stop = true
      const m = text.match(/\/add\/(\d{5})\b/)
      if (m && text.startsWith(window.location.origin)) { close.current(); nav(`/add/${m[1]}`); return }
      if (/^\d{5}$/.test(text)) { close.current(); nav(`/add/${text}`); return }
      setFound(text)
    }
    ;(async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      } catch { setErr('Accès à la caméra refusé. Autorise-la dans les réglages du navigateur.'); return }
      if (stop || !video.current) { stream.getTracks().forEach((t) => t.stop()); return }
      video.current.srcObject = stream
      await video.current.play().catch(() => {})
      const BD = (window as unknown as { BarcodeDetector?: new (o: object) => Detector }).BarcodeDetector
      let detector: Detector | null = null
      if (BD) try { detector = new BD({ formats: ['qr_code'] }) } catch { detector = null }
      const jsQR = detector ? null : (await import('jsqr')).default
      const tick = async () => {
        if (stop || !video.current) return
        const v = video.current
        if (v.readyState >= 2) {
          try {
            if (detector) {
              const r = await detector.detect(v)
              if (r[0]?.rawValue) return handle(r[0].rawValue)
            } else if (jsQR) {
              const w = 480, h = Math.round((v.videoHeight / v.videoWidth) * w) || 480
              canvas.width = w; canvas.height = h
              ctx.drawImage(v, 0, 0, w, h)
              const r = jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'dontInvert' })
              if (r?.data) return handle(r.data)
            }
          } catch { /* image suivante */ }
        }
        timer = window.setTimeout(tick, 200)
      }
      tick()
    })()
    return () => { stop = true; clearTimeout(timer); stream?.getTracks().forEach((t) => t.stop()) }
  }, [open, nav])

  return (
    <Sheet open={open} onClose={onClose} title="Scanner un QR code">
      <div className="qr-scan" data-no-swipe>
        {err ? <p className="info center">{err}</p> : <>
          <video ref={video} playsInline muted />
          <div className="qr-frame" />
        </>}
      </div>
      {found
        ? <p className="muted small center">Ce QR code n'est pas un lien d'ami LePtiGrp :<br /><span className="qr-found">{found}</span></p>
        : !err && <p className="muted small center">Vise le QR code d'un ami pour l'ajouter.</p>}
    </Sheet>
  )
}
