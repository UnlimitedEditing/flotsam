import { HashRouter, NavLink, Route, Routes } from 'react-router-dom'
import { useSignedIn } from './api/storage'
import Chat from './screens/Chat'
import Gallery from './screens/Gallery'
import Gate from './screens/Gate'
import Login from './screens/Login'
import Queue from './screens/Queue'
import Settings from './screens/Settings'
import Workflows from './screens/Workflows'
import { OfflineBanner, UpdateBanner } from './components/Banners'
import PrivacyCover from './components/PrivacyCover'
import LockScreen from './screens/LockScreen'
import { useLocked } from './security/lock'
import { useJobs } from './jobs/instance'
import { isFinished } from './jobs/types'
import { useBootstrapReady } from './state/bootstrap'
import { useConsentValid } from './state/consent'
import { useApplyDiscreet } from './state/discreet'

function TabBar() {
  const active = useJobs().filter((j) => !isFinished(j.status)).length
  const tabs: Array<[string, string]> = [
    ['/', 'Chat'],
    ['/workflows', 'Workflows'],
    ['/queue', active ? `Queue (${active})` : 'Queue'],
    ['/gallery', 'Gallery'],
    ['/settings', 'Settings'],
  ]
  return (
    <nav className="tabs">
      {tabs.map(([to, label]) => (
        <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => (isActive ? 'on' : '')}>
          {label}
        </NavLink>
      ))}
    </nav>
  )
}

function Shell({ onSignOut }: { onSignOut: () => void }) {
  return (
    <HashRouter>
      <div className="shell">
        <UpdateBanner />
        <OfflineBanner />
        <div className="view">
          <Routes>
            <Route path="/" element={<Chat />} />
            <Route path="/workflows" element={<Workflows />} />
            <Route path="/queue" element={<Queue />} />
            <Route path="/gallery" element={<Gallery />} />
            <Route path="/settings" element={<Settings onSignOut={onSignOut} />} />
          </Routes>
        </div>
        <TabBar />
      </div>
    </HashRouter>
  )
}

export default function App() {
  const ready = useBootstrapReady()
  const consented = useConsentValid()
  const locked = useLocked()
  const signedIn = useSignedIn()
  useApplyDiscreet()

  // Order: stored state loads (nothing shown), then the gate, then key entry, then the app.
  // No screen, and no network request, exists before the gate is passed.
  let screen = null
  if (ready) {
    // A locked app renders only the lock screen: no app content is in the DOM behind it.
    if (locked) screen = <LockScreen />
    else if (!consented) screen = <Gate />
    else if (!signedIn) screen = <Login onDone={() => {}} />
    else screen = <Shell onSignOut={() => {}} />
  }
  return (
    <>
      {screen}
      <PrivacyCover />
    </>
  )
}
