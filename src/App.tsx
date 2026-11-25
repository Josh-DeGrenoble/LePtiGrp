import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import { isConfigured } from './lib/supabase'
import Login from './pages/Login'
import Conversations from './pages/Conversations'
import Friends from './pages/Friends'
import AddFriend from './pages/AddFriend'
import { TagEdit, TagsList } from './pages/Tags'
import NewGroup from './pages/NewGroup'
import Chat from './pages/Chat'
import GroupSettings from './pages/GroupSettings'

function Routed() {
  const { session, loading } = useAuth()
  if (loading) return <div className="splash">LePtiGrp</div>
  if (!session) return <Login />
  return (
    <Routes>
      <Route path="/" element={<Conversations />} />
      <Route path="/friends" element={<Friends />} />
      <Route path="/add/:code" element={<AddFriend />} />
      <Route path="/tags" element={<TagsList />} />
      <Route path="/tags/:id" element={<TagEdit />} />
      <Route path="/new" element={<NewGroup />} />
      <Route path="/c/:id" element={<Chat />} />
      <Route path="/c/:id/settings" element={<GroupSettings />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  if (!isConfigured) return <div className="splash small">Configuration Supabase manquante (fichier .env).</div>
  return (
    <AuthProvider>
      <BrowserRouter><Routed /></BrowserRouter>
    </AuthProvider>
  )
}
