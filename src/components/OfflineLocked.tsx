import { IconLock } from './Icons'

/** Outil partagé ouvert sans réseau : on ne l'affiche pas (les autres peuvent l'avoir modifié) */
export function OfflineLocked() {
  return <div className="offline-locked fade-in">
    <IconLock size={28} />
    <p><b>Pas de réseau</b></p>
    <p className="muted">Partagé avec d'autres personnes : il faut être connecté pour l'ouvrir. Tes éléments perso restent utilisables hors ligne.</p>
  </div>
}
