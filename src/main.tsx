import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { setConsentChecker } from './api/client'
import { engine } from './jobs/instance'
import { initInstall } from './pwa/install'
import { startNotifier } from './pwa/notify'
import { initPwa } from './pwa/register'
import { isConsentValid, onConsentChange } from './state/consent'
import { getPrefs } from './state/prefs'

setConsentChecker(isConsentValid) // the age gate: nothing reaches the network until it is passed
engine.setGate(isConsentValid) // queued jobs also wait for the gate
onConsentChange(() => isConsentValid() && engine.resume())
initPwa()
initInstall()
startNotifier(engine, () => getPrefs().notifyDone)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
