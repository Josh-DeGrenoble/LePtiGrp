import { Screen } from '../components/Layout'
import { BackButton } from '../components/BackButton'
import { AdminUsage } from '../components/AdminUsage'
import { AdminCircles } from '../components/Circles'
import { AdminBeers, AdminFeedback } from '../components/Feedback'
import { useIsAdmin } from '../lib/admin'

/** Espace admin de l'appli (icône en haut à droite des Paramètres, visible seulement par les admins) */
export default function AdminPage() {
  const admin = useIsAdmin()
  return (
    <Screen header={<><BackButton to="/settings" /><h1>Admin</h1><span className="icon-btn" /></>}>
      <div className="settings-page">
        {!admin && <p className="empty">Réservé aux admins de l'appli.</p>}
        <AdminUsage />
        <AdminCircles />
        <AdminBeers />
        <AdminFeedback />
      </div>
    </Screen>
  )
}
