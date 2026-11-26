import { useEffect } from 'react'
import { useLocation, useNavigate, useNavigationType } from 'react-router-dom'
import { IconBack } from './Icons'

// Pile des pages visitées, pour savoir si la page parente est juste derrière dans l'historique
const stack: string[] = []
let backRequested = false
let lastPath = ''
/** Sens de la dernière navigation, pour l'animation d'entrée de page */
export let navDirection: 'forward' | 'back' = 'forward'

export function useTrackHistory() {
  const loc = useLocation()
  const type = useNavigationType()
  // calculé pendant le rendu, avant que la nouvelle page s'affiche
  if (loc.pathname !== lastPath) {
    navDirection = (type === 'POP' && stack.length > 0) || backRequested ? 'back' : 'forward'
    lastPath = loc.pathname
  }
  useEffect(() => {
    backRequested = false
    if (type === 'POP') {
      const i = stack.lastIndexOf(loc.pathname)
      if (i >= 0) stack.length = i + 1; else stack.push(loc.pathname)
    } else if (type === 'REPLACE') stack[Math.max(0, stack.length - 1)] = loc.pathname
    else stack.push(loc.pathname)
  }, [loc.pathname, type])
}

/**
 * Bouton retour : remonte toujours à la page parente (`to`) dans la hiérarchie de l'appli.
 * Si la parente est la page précédente, on recule dans l'historique (le geste retour du téléphone reste cohérent),
 * sinon on la remplace pour ne pas empiler de pages.
 */
export function BackButton({ to }: { to: string }) {
  const nav = useNavigate()
  const back = () => {
    backRequested = true
    if (stack.length >= 2 && stack[stack.length - 2] === to) nav(-1)
    else nav(to, { replace: true })
  }
  return <button className="icon-btn" onClick={back} aria-label="Retour"><IconBack /></button>
}
