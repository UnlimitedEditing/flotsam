import { useSyncExternalStore } from 'react'
import { idbStore } from '../jobs/store'
import { registerBootstrap } from '../state/bootstrap'
import { getPrefs } from '../state/prefs'
import { createPinService, type VerifyResult } from './pin'

// App lock state. While locked, App renders only the lock screen: no app content is in the DOM.
// The job engine keeps running underneath (a render in progress is not interrupted by locking).

export const pinService = createPinService(idbStore)

interface Inputs {
  hasPin: boolean
  timeoutMin: number // minutes in the background before locking; 0 = immediately; -1 = never
  hiddenAt: number | null
  now: number
}

/** Pure: should coming back to the foreground show the lock screen? */
export function shouldLock({ hasPin, timeoutMin, hiddenAt, now }: Inputs): boolean {
  if (!hasPin || hiddenAt == null || timeoutMin < 0) return false
  return now - hiddenAt >= timeoutMin * 60_000
}

let locked = false
let pinSet = false
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())
const subscribe = (cb: () => void) => (listeners.add(cb), () => listeners.delete(cb))

/** Starts locked when a PIN exists, so a cold open always asks. */
export const lockReady: Promise<void> = pinService.hasPin().then((has) => {
  pinSet = has
  locked = has
  emit()
})
registerBootstrap(lockReady)

export const isLocked = () => locked
export const useLocked = (): boolean => useSyncExternalStore(subscribe, isLocked)
export const usePinSet = (): boolean => useSyncExternalStore(subscribe, () => pinSet)

export function lockNow(): void {
  if (!pinSet) return
  locked = true
  emit()
}

/** After a successful fingerprint/face check (done by the native layer). */
export function unlockWithBiometric(): void {
  locked = false
  emit()
}

export async function unlock(pin: string): Promise<VerifyResult> {
  const r = await pinService.verify(pin)
  if (r.ok) {
    locked = false
    emit()
  }
  return r
}

/** Call after a PIN is set or removed. Setting one does not lock the current session. */
export function pinChanged(has: boolean): void {
  pinSet = has
  if (!has) locked = false
  emit()
}

/** Locks when the app returns from the background after the configured time. Mount once at startup. */
export function startLockWatcher(): () => void {
  let hiddenAt: number | null = null
  const onChange = () => {
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now()
      return
    }
    if (shouldLock({ hasPin: pinSet, timeoutMin: getPrefs().lockTimeoutMin, hiddenAt, now: Date.now() })) {
      locked = true
      emit()
    }
    hiddenAt = null
  }
  document.addEventListener('visibilitychange', onChange)
  return () => document.removeEventListener('visibilitychange', onChange)
}
