import { HashRouter, NavLink, Route, Routes } from 'react-router-dom'
import { useSignedIn } from './api/storage'
import Chat from './screens/Chat'
import Gallery from './screens/Gallery'
import Gate from './screens/Gate'
import Login from './screens/Login'
import Queue from './screens/Queue'
import Settings from './screens/Settings'
import Share from './screens/Share'
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
        <NativeEvents />
        <NativeUpdateBanner />
        <UpdateBanner />
        <OfflineBanner />
        <div className="view">
          <Routes>
            <Route path="/" element={<Chat />} />
            <Route path="/workflows" element={<Workflows />} />
            <Route path="/queue" element={<Queue />} />
            <Route path="/gallery" element={<Gallery />} />
            <Route path="/share" element={<Share />} />
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
