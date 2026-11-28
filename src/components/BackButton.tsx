import { useEffect } from 'react'
import { useLocation, useNavigate, useNavigationType, type NavigateFunction } from 'react-router-dom'
import { IconBack } from './Icons'

// Pile des pages visitées, pour savoir si la page parente est juste derrière dans l'historique
const stack: string[] = []
let backRequested = false
let lastPath = ''
// Dernier état de navigation vu pour chaque page (d'où on venait) : remis quand on y retourne sans l'historique,
// sinon la page parente oublie sa propre page de retour (ex. Sondages -> retour à l'accueil au lieu de la conv)
const lastState = new Map<string, unknown>()
/**
 * Appli ouverte directement sur une page intérieure (notif, lien) : on glisse l'accueil dessous dans l'historique,
 * pour que le retour du téléphone ramène à l'accueil au lieu de fermer l'appli.
 * À appeler avant le 1er rendu. Un rechargement garde l'état du routeur (history.state) : rien n'est ajouté.
 */
export function seedHome() {
  const { pathname, search, hash } = window.location
  if (pathname === '/' || history.state || /^\/(confirmed|confidentialite)$/.test(pathname)) return
  history.replaceState({ usr: null, key: 'home', idx: 0 }, '', '/')
  history.pushState({ usr: null, key: 'deep', idx: 1 }, '', pathname + search + hash)
  stack.push('/')
}

/** Sens de la dernière navigation, pour l'animation d'entrée de page */
export let navDirection: 'forward' | 'back' = 'forward'

export function useTrackHistory() {
  const loc = useLocation()
  const type = useNavigationType()
  // calculé pendant le rendu, avant que la nouvelle page s'affiche
  if (loc.pathname !== lastPath) {
    navDirection = (type === 'POP' && lastPath !== '') || backRequested ? 'back' : 'forward'
    lastPath = loc.pathname
  }
  useEffect(() => {
    backRequested = false
    if (loc.state) lastState.set(loc.pathname, loc.state)
    if (type === 'POP') {
      const i = stack.lastIndexOf(loc.pathname)
      if (i >= 0) stack.length = i + 1; else stack.push(loc.pathname)
    } else if (type === 'REPLACE') stack[Math.max(0, stack.length - 1)] = loc.pathname
    else stack.push(loc.pathname)
  }, [loc.pathname, type, loc.state])
}

/**
 * Bouton retour : remonte toujours à la page parente (`to`) dans la hiérarchie de l'appli.
 * Si la parente est la page précédente, on recule dans l'historique (le geste retour du téléphone reste cohérent),
 * sinon on la remplace pour ne pas empiler de pages.
 */
export function goBack(nav: NavigateFunction, to: string) {
  backRequested = true
  if (stack.length >= 2 && stack[stack.length - 2] === to) nav(-1)
  else nav(to, { replace: true, state: lastState.get(to) })
}

/** Page de retour d'un outil : celle d'où on vient, sinon la conv liée, sinon l'accueil (ouvert par une notif ou un lien) */
export function toolBack(from: string | undefined, conv: string | null | undefined) {
  return from ?? (conv ? `/c/${conv}` : '/')
}

export function BackButton({ to }: { to: string }) {
  const nav = useNavigate()
  const back = () => goBack(nav, to)
  return <button className="icon-btn" onClick={back} aria-label="Retour"><IconBack /></button>
}
