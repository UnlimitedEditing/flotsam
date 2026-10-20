import { useEffect, useState } from 'react'
import { consentReady } from './consent'
import { prefsReady } from './prefs'

/** Stored state (consent, preferences, ...) that must be loaded before anything is shown, so the app never flashes before the gate. */
const all: Array<Promise<unknown>> = [consentReady, prefsReady]
export function registerBootstrap(p: Promise<unknown>): void {
  all.push(p)
}

export function useBootstrapReady(): boolean {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let alive = true
    void Promise.all(all).then(() => alive && setReady(true))
    return () => {
      alive = false
    }
  }, [])
  return ready
}
