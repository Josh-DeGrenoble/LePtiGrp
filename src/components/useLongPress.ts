import { useRef } from 'react'

/** Appui long (mobile) + clic droit (ordinateur) */
export function useLongPress(onLongPress: () => void, onClick?: (e: React.PointerEvent) => void, ms = 450) {
  const timer = useRef<number | undefined>(undefined)
  const fired = useRef(false)
  const start = useRef({ x: 0, y: 0 })

  const clear = () => { window.clearTimeout(timer.current); timer.current = undefined }

  return {
    onPointerDown: (e: React.PointerEvent) => {
      fired.current = false
      start.current = { x: e.clientX, y: e.clientY }
      timer.current = window.setTimeout(() => {
        fired.current = true
        navigator.vibrate?.(15)
        onLongPress()
      }, ms)
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (Math.abs(e.clientX - start.current.x) > 8 || Math.abs(e.clientY - start.current.y) > 8) clear()
    },
    onPointerUp: (e: React.PointerEvent) => { const t = timer.current; clear(); if (!fired.current && t !== undefined) onClick?.(e) },
    onPointerLeave: clear,
    onPointerCancel: clear,
    onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); clear(); fired.current = true; onLongPress() },
  }
}
