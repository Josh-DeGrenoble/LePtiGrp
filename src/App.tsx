import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import { isConfigured } from './lib/supabase'
import Login from './pages/Login'
import Conversations from './pages/Conversations'
import Friends from './pages/Friends'
import AddFriend from './pages/AddFriend'
import Tags from './pages/Tags'
import { DialogHost } from './components/Dialog'
import { NotifPrompt } from './components/NotifPrompt'
import { useTrackHistory, navDirection } from './components/BackButton'
import { useEffect, useState } from 'react'
import { startOutbox } from './lib/network'
import { syncPush } from './lib/push'
import { startReminders } from './lib/reminders'
import NewGroup from './pages/NewGroup'
import Chat from './pages/Chat'
import Settings from './pages/Settings'
import GroupSettings from './pages/GroupSettings'
import MediaGallery from './pages/MediaGallery'
import NoteList from './pages/NoteList'
import ToolIndex from './pages/ToolIndex'
import NewTool from './pages/NewTool'
import LedgerPage from './pages/LedgerPage'
import PollPage from './pages/PollPage'
import CalendarPage from './pages/CalendarPage'
import AdminPage from './pages/AdminPage'
import EventPage from './pages/EventPage'
import { ErrorBoundary } from './components/ErrorBoundary'
import Confirmed from './pages/Confirmed'
import Privacy from './pages/Privacy'
import { rememberFriendCode, addPendingFriend, rememberCircle, joinPendingCircle } from './lib/friends'
import JoinCircle from './pages/JoinCircle'
import { initE2EE, useE2EE } from './lib/e2ee'
import E2EESetup, { hasPassword, E2EEInfo, infoSeen } from './pages/E2EESetup'

function Routed() {
  const { session, loading } = useAuth()
  useTrackHistory()
  const { pathname } = useLocation()
  const uid = session?.user.id
  const { state: e2ee } = useE2EE()
  const [infoDone, setInfoDone] = useState(false)
  useEffect(() => { if (uid) initE2EE(uid) }, [uid])
  useEffect(() => { if (uid && e2ee === 'ready') { startOutbox(); syncPush(); startReminders(); addPendingFriend(); joinPendingCircle() } }, [uid, e2ee])
  // lien d'ami ouvert sans être connecté : on garde le code, l'ami est ajouté à la 1re connexion (après l'inscription)
  if (!session && /^\/add\/\d{5}$/.test(pathname)) rememberFriendCode(pathname.slice(5))
  if (!session && /^\/cercle\/[0-9a-f]{18}$/.test(pathname)) rememberCircle(pathname.slice(8))
  // lien de confirmation du mail : page simple, sans l'appli
  if (pathname === '/confirmed') return <Confirmed />
  if (pathname === '/confidentialite') return <Privacy />
  if (loading) return <div className="splash">LePtiGrp</div>
  if (!session) return <Login />
  if (e2ee !== 'ready') return <E2EESetup state={e2ee} uid={session.user.id} email={session.user.email ?? ''} hasPassword={hasPassword(session.user)} />
  if (!infoDone && !infoSeen(session.user.id, session.user.user_metadata)) return <E2EEInfo uid={session.user.id} onDone={() => setInfoDone(true)} />
  return (<>
    <div key={pathname} className={`page page-${navDirection}`}>
    <ErrorBoundary>
    <Routes>
      <Route path="/" element={<Conversations />} />
      <Route path="/friends" element={<Friends />} />
      <Route path="/add/:code" element={<AddFriend />} />
      <Route path="/cercle/:token" element={<JoinCircle />} />
      <Route path="/tags" element={<Tags />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/new" element={<NewGroup />} />
      <Route path="/c/:id" element={<Chat />} />
      <Route path="/c/:id/settings" element={<GroupSettings />} />
      <Route path="/c/:id/media" element={<MediaGallery />} />
      <Route path="/notes" element={<ToolIndex key="notes" kind="notes" />} />
      <Route path="/notes/new" element={<NewTool key="notes" kind="notes" />} />
      <Route path="/notes/:id" element={<NoteList />} />
      <Route path="/accounts" element={<ToolIndex key="accounts" kind="accounts" />} />
      <Route path="/accounts/new" element={<NewTool key="accounts" kind="accounts" />} />
      <Route path="/accounts/:id" element={<LedgerPage />} />
      <Route path="/polls" element={<ToolIndex key="polls" kind="polls" />} />
      <Route path="/polls/new" element={<NewTool key="polls" kind="polls" />} />
      <Route path="/polls/:id" element={<PollPage />} />
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/calendar" element={<CalendarPage />} />
      <Route path="/calendar/new" element={<CalendarPage />} />
      <Route path="/calendar/:id" element={<EventPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </ErrorBoundary>
    </div>
    <NotifPrompt />
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
