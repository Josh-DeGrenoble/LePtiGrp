import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import { isConfigured } from './lib/supabase'
import Login from './pages/Login'
import Conversations from './pages/Conversations'
import Friends from './pages/Friends'
import AddFriend from './pages/AddFriend'
import Tags from './pages/Tags'
import { DialogHost } from './components/Dialog'
import { useTrackHistory } from './components/BackButton'
import { useEffect } from 'react'
import { startOutbox, useOnline } from './lib/network'
import { syncPush } from './lib/push'
import NewGroup from './pages/NewGroup'
import Chat from './pages/Chat'
import Settings from './pages/Settings'
import GroupSettings from './pages/GroupSettings'

function Routed() {
  const { session, loading } = useAuth()
  const online = useOnline()
  useTrackHistory()
  const uid = session?.user.id
  useEffect(() => { if (uid) { startOutbox(); syncPush() } }, [uid])
  if (loading) return <div className="splash">LePtiGrp</div>
  if (!session) return <Login />
  return (<>
    {!online && <div className="offline-banner">Hors connexion · tes messages partiront dès le retour du réseau</div>}
    <Routes>
      <Route path="/" element={<Conversations />} />
      <Route path="/friends" element={<Friends />} />
      <Route path="/add/:code" element={<AddFriend />} />
      <Route path="/tags" element={<Tags />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/new" element={<NewGroup />} />
      <Route path="/c/:id" element={<Chat />} />
      <Route path="/c/:id/settings" element={<GroupSettings />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </>)
}

export default function App() {
  if (!isConfigured) return <div className="splash small">Configuration Supabase manquante (fichier .env).</div>
  return (
    <AuthProvider>
      <BrowserRouter><Routed /></BrowserRouter>
      <DialogHost />
    </AuthProvider>
  )
}
