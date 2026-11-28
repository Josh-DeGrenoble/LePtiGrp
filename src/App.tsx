import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/auth'
import { isConfigured } from './lib/supabase'
import Login from './pages/Login'
import Conversations from './pages/Conversations'
import { DialogHost } from './components/Dialog'
import { NotifPrompt } from './components/NotifPrompt'
import { useTrackHistory, navDirection } from './components/BackButton'
import { lazy, Suspense, useEffect, useState } from 'react'
import { startOutbox } from './lib/network'
import { syncPush } from './lib/push'
import { startReminders } from './lib/reminders'
import Chat from './pages/Chat'
import { ErrorBoundary } from './components/ErrorBoundary'
import { rememberFriendCode, addPendingFriend, rememberCircle, joinPendingCircle } from './lib/friends'
import { initE2EE, useE2EE } from './lib/e2ee'
import E2EESetup, { hasPassword, E2EEInfo, infoSeen } from './pages/E2EESetup'


// Pages chargées à la demande : l'ouverture n'attend que la liste des conversations et le chat.
// Elles sont ensuite préchargées en arrière-plan, pour que la navigation reste instantanée.
const pages = {
  Friends: () => import('./pages/Friends'),
  AddFriend: () => import('./pages/AddFriend'),
  Tags: () => import('./pages/Tags'),
  NewGroup: () => import('./pages/NewGroup'),
  Settings: () => import('./pages/Settings'),
  GroupSettings: () => import('./pages/GroupSettings'),
  MediaGallery: () => import('./pages/MediaGallery'),
  NoteList: () => import('./pages/NoteList'),
  ToolIndex: () => import('./pages/ToolIndex'),
  NewTool: () => import('./pages/NewTool'),
  LedgerPage: () => import('./pages/LedgerPage'),
  PollPage: () => import('./pages/PollPage'),
  CalendarPage: () => import('./pages/CalendarPage'),
  AdminPage: () => import('./pages/AdminPage'),
  EventPage: () => import('./pages/EventPage'),
  Confirmed: () => import('./pages/Confirmed'),
  Privacy: () => import('./pages/Privacy'),
  JoinCircle: () => import('./pages/JoinCircle'),
}
const Friends = lazy(pages.Friends)
const AddFriend = lazy(pages.AddFriend)
const Tags = lazy(pages.Tags)
const NewGroup = lazy(pages.NewGroup)
const Settings = lazy(pages.Settings)
const GroupSettings = lazy(pages.GroupSettings)
const MediaGallery = lazy(pages.MediaGallery)
const NoteList = lazy(pages.NoteList)
const ToolIndex = lazy(pages.ToolIndex)
const NewTool = lazy(pages.NewTool)
const LedgerPage = lazy(pages.LedgerPage)
const PollPage = lazy(pages.PollPage)
const CalendarPage = lazy(pages.CalendarPage)
const AdminPage = lazy(pages.AdminPage)
const EventPage = lazy(pages.EventPage)
const Confirmed = lazy(pages.Confirmed)
const Privacy = lazy(pages.Privacy)
const JoinCircle = lazy(pages.JoinCircle)
export function preloadPages() {
  const run = () => Object.values(pages).forEach((load) => load().catch(() => {}))
  if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 3000 }); else setTimeout(run, 1500)
}

function Routed() {
  const { session, loading } = useAuth()
  useTrackHistory()
  const { pathname } = useLocation()
  const uid = session?.user.id
  const { state: e2ee, checked } = useE2EE()
  const [infoDone, setInfoDone] = useState(false)
  useEffect(() => { if (uid) initE2EE(uid) }, [uid])
  useEffect(() => { if (uid && e2ee === 'ready') preloadPages() }, [uid, e2ee])
  // envois seulement une fois la clé locale confirmée par le serveur (l'affichage, lui, n'attend pas)
  useEffect(() => { if (uid && e2ee === 'ready' && checked) { startOutbox(); syncPush(); startReminders(); addPendingFriend(); joinPendingCircle() } }, [uid, e2ee, checked])
  // lien d'ami ouvert sans être connecté : on garde le code, l'ami est ajouté à la 1re connexion (après l'inscription)
  if (!session && /^\/add\/\d{5}$/.test(pathname)) rememberFriendCode(pathname.slice(5))
  if (!session && /^\/cercle\/[0-9a-f]{18}$/.test(pathname)) rememberCircle(pathname.slice(8))
  // lien de confirmation du mail : page simple, sans l'appli
  if (pathname === '/confirmed') return <Suspense fallback={null}><Confirmed /></Suspense>
  if (pathname === '/confidentialite') return <Suspense fallback={null}><Privacy /></Suspense>
  if (loading) return <div className="splash">LePtiGrp</div>
  if (!session) return <Login />
  if (e2ee !== 'ready') return <E2EESetup state={e2ee} uid={session.user.id} email={session.user.email ?? ''} hasPassword={hasPassword(session.user)} />
  if (!infoDone && !infoSeen(session.user.id, session.user.user_metadata)) return <E2EEInfo uid={session.user.id} onDone={() => setInfoDone(true)} />
  return (<>
    <div key={pathname} className={`page page-${navDirection}`}>
    <ErrorBoundary>
    <Suspense fallback={null}>
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
    </Suspense>
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
