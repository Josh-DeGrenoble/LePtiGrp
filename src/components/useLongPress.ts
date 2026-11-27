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
    onPointerUp: (e: React.PointerEvent) => {
      const t = timer.current; clear()
      if (fired.current) swallowNextClick()  // le doigt se relève sur la fenêtre ouverte par l'appui long : ce n'est pas un clic
      else if (t !== undefined) onClick?.(e)
    },
    onPointerLeave: clear,
    onPointerCancel: clear,
    onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); clear(); fired.current = true; onLongPress() },
  }
}

/** Annule le clic qui suit le relâchement d'un appui long (sinon il tombe sur un bouton du menu qui vient de s'ouvrir) */
export function swallowNextClick() {
  const stop = (e: Event) => { e.preventDefault(); e.stopPropagation(); off() }
  const off = () => { document.removeEventListener('click', stop, true); clearTimeout(t) }
  document.addEventListener('click', stop, true)
  const t = setTimeout(off, 500)
}
