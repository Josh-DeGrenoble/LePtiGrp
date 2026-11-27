import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/sora/latin-600.css'
import '@fontsource/sora/latin-700.css'
import './index.css'
import App from './App.tsx'
import { trackViewport } from './lib/viewport'
import { applyTextScale } from './lib/textScale'
import { applyAccent } from './lib/accent'
applyTextScale()
applyAccent()

trackViewport()

// Mise à jour automatique : dès qu'une nouvelle version de l'appli prend la main, on recharge la page
// (sinon le téléphone garde l'ancienne version en cache jusqu'à la fermeture complète de l'appli)
if ('serviceWorker' in navigator) {
  const hadController = !!navigator.serviceWorker.controller
  let reloaded = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController && !reloaded) { reloaded = true; location.reload() }
  })
  // Vérifie s'il existe une nouvelle version à chaque retour dans l'appli
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') navigator.serviceWorker.getRegistration().then((r) => r?.update()).catch(() => {})
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
