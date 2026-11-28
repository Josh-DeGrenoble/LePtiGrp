/**
 * Clavier mobile : sur iPhone, le clavier fait glisser toute la page vers le haut.
 * On cale la hauteur de l'appli sur la zone réellement visible (visualViewport) :
 * l'en-tête reste en place, la liste des messages rétrécit et le champ de saisie colle au clavier.
 */
export function trackViewport() {
  trackOrientation()
  const vv = window.visualViewport
  if (!vv) return
  const update = () => {
    document.documentElement.style.setProperty('--app-h', `${vv.height}px`)
    // annule le décalage de page appliqué par iOS à l'ouverture du clavier
    if (window.scrollY !== 0) window.scrollTo(0, 0)
    window.dispatchEvent(new Event('app-resize'))
  }
  vv.addEventListener('resize', update)
  vv.addEventListener('scroll', update)
  update()
}

/**
 * Téléphone tenu à l'horizontale (navigateur) : invitation à le redresser.
 * On regarde l'écran physique et non la taille de la page, que le clavier réduit.
 */
function trackOrientation() {
  const coarse = matchMedia('(pointer: coarse)')
  const update = () => {
    const type = screen.orientation?.type
    const landscape = type ? type.startsWith('landscape') : Math.abs(Number(window.orientation ?? 0)) === 90
    const phone = Math.min(screen.width, screen.height) <= 520
    document.documentElement.classList.toggle('landscape-lock', landscape && phone && coarse.matches)
  }
  screen.orientation?.addEventListener?.('change', update)
  window.addEventListener('orientationchange', update)
  update()
}
