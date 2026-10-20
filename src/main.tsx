import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { engine } from './jobs/instance'
import { initInstall } from './pwa/install'
import { startNotifier } from './pwa/notify'
import { initPwa } from './pwa/register'
import { getPrefs } from './state/prefs'

initPwa()
initInstall()
startNotifier(engine, () => getPrefs().notifyDone)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
