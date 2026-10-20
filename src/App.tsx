import { useState } from 'react'
import { HashRouter, NavLink, Route, Routes } from 'react-router-dom'
import { getApiKey } from './api/storage'
import Chat from './screens/Chat'
import Gallery from './screens/Gallery'
import Login from './screens/Login'
import Queue from './screens/Queue'
import Settings from './screens/Settings'
import Workflows from './screens/Workflows'
import { useJobs } from './jobs/instance'
import { isFinished } from './jobs/types'
import './state/prefs' // starts loading saved preferences and applies the theme

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

export default function App() {
  const [signedIn, setSignedIn] = useState(!!getApiKey())

  if (!signedIn) return <Login onDone={() => setSignedIn(true)} />

  return (
    <HashRouter>
      <div className="shell">
        <div className="view">
          <Routes>
            <Route path="/" element={<Chat />} />
            <Route path="/workflows" element={<Workflows />} />
            <Route path="/queue" element={<Queue />} />
            <Route path="/gallery" element={<Gallery />} />
            <Route path="/settings" element={<Settings onSignOut={() => setSignedIn(false)} />} />
          </Routes>
        </div>
        <TabBar />
      </div>
    </HashRouter>
  )
}
