import type { CSSProperties } from 'react'
import { HashRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom'
import Icon, { type IconName } from './components/ui/Icon'
import { useDirection } from './lib/motion'
import { useSignedIn } from './api/storage'
import Chat from './screens/Chat'
import Gallery from './screens/Gallery'
import Gate from './screens/Gate'
import Login from './screens/Login'
import Queue from './screens/Queue'
import Settings from './screens/Settings'
import Share from './screens/Share'
import RigBuilder from './screens/RigBuilder'
import NativeEvents from './native/NativeEvents'
import Workflows from './screens/Workflows'
import { NativeUpdateBanner, OfflineBanner, UpdateBanner } from './components/Banners'
import PrivacyCover from './components/PrivacyCover'
import LockScreen from './screens/LockScreen'
import { useLocked } from './security/lock'
import { useEffect } from 'react'
import UpdateRequired from './screens/UpdateRequired'
import { checkForUpdate, useAppUpdate } from './native/updater'
import { isForced, pickScreen } from './native/updateState'
import { isNative } from './native/platform'
import { useJobs } from './jobs/instance'
import { isFinished } from './jobs/types'
import { useBootstrapReady } from './state/bootstrap'
import { useConsentValid } from './state/consent'
import { useApplyDiscreet } from './state/discreet'

const TABS: Array<{ to: string; label: string; icon: IconName }> = [
  { to: '/', label: 'Chat', icon: 'chat' },
  { to: '/workflows', label: 'Workflows', icon: 'workflows' },
  { to: '/queue', label: 'Queue', icon: 'queue' },
  { to: '/gallery', label: 'Gallery', icon: 'gallery' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
]
const TAB_ORDER = TABS.map((t) => t.to)

function TabBar() {
  const active = useJobs().filter((j) => !isFinished(j.status)).length
  const { pathname } = useLocation()
  const current = TAB_ORDER.indexOf(pathname)
  return (
    <nav className="tabs glass" style={{ '--i': Math.max(current, 0), '--n': TABS.length } as CSSProperties}>
      {current >= 0 && <span className="tab-indicator" aria-hidden="true" />}
      {TABS.map(({ to, label, icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) => (isActive ? 'on' : '')}
          aria-label={to === '/queue' && active ? `${label}, ${active} running` : label}
        >
          <span className="tab-icon">
            <Icon name={icon} size={22} />
            {to === '/queue' && active > 0 && (
              <span key={active} className="badge">
                {active}
              </span>
            )}
          </span>
          <span className="tab-label">{label}</span>
        </NavLink>
      ))}
    </nav>
  )
}

/** Each route change enters with a short fade and slide; tab moves slide the way the tab bar moved. */
function AnimatedView({ onSignOut }: { onSignOut: () => void }) {
  const { pathname } = useLocation()
  const direction = useDirection(TAB_ORDER, pathname)
  return (
    <div className="view">
      <div key={pathname} className="view-page" data-dir={direction}>
        <Routes>
          <Route path="/" element={<Chat />} />
          <Route path="/workflows" element={<Workflows />} />
          <Route path="/queue" element={<Queue />} />
          <Route path="/gallery" element={<Gallery />} />
          <Route path="/share" element={<Share />} />
          <Route path="/rig/new" element={<RigBuilder />} />
          <Route path="/settings" element={<Settings onSignOut={onSignOut} />} />
        </Routes>
      </div>
    </div>
  )
}

function Shell({ onSignOut }: { onSignOut: () => void }) {
  return (
    <HashRouter>
      <div className="shell">
        <NativeEvents />
        <NativeUpdateBanner />
        <UpdateBanner />
        <OfflineBanner />
        <AnimatedView onSignOut={onSignOut} />
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
  const update = useAppUpdate()
  useApplyDiscreet()

  // Once a day, in the Android app: look for a new version. Never before stored state has loaded.
  useEffect(() => {
    if (ready && isNative()) void checkForUpdate(true)
  }, [ready])

  // Order: stored state loads (nothing shown), a forced update, the lock, the age gate, key entry, the app.
  // No screen, and no network request, exists before the gate is passed (the update check is the one exception:
  // it sends nothing but the device's address to the update host, and updating must not depend on consent).
  const which = pickScreen({ ready, forcedUpdate: isForced(update), locked, consented, signedIn })
  const screens = {
    blank: null,
    update: <UpdateRequired />,
    lock: <LockScreen />,
    gate: <Gate />,
    login: <Login onDone={() => {}} />,
    app: <Shell onSignOut={() => {}} />,
  }
  return (
    <>
      {screens[which]}
      <PrivacyCover />
    </>
  )
}
