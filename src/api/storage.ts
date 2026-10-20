import { useSyncExternalStore } from 'react'
import { FlotsamNative } from '../native/plugin'
import { isNative } from '../native/platform'
import { registerBootstrap } from '../state/bootstrap'

// The Graydient API key.
//  - Web/PWA: localStorage (wrapped so a blocked/private-mode browser never throws).
//  - Android app: the Kotlin plugin keeps it in Keystore-backed encrypted storage (so the background worker can
//    read it too). Reads stay synchronous through an in-memory copy that is loaded before the app first renders.
const KEY = 'flotsam.apiKey'

let nativeKey = ''
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function getApiKey(): string {
  if (isNative()) return nativeKey
  try {
    return localStorage.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}

export function setApiKey(key: string): void {
  if (isNative()) {
    nativeKey = key
    void FlotsamNative.setApiKey({ value: key })
  } else {
    try {
      localStorage.setItem(KEY, key)
    } catch {
      /* storage unavailable */
    }
  }
  emit()
}

export function clearApiKey(): void {
  if (isNative()) {
    nativeKey = ''
    void FlotsamNative.setApiKey({ value: '' })
  } else {
    try {
      localStorage.removeItem(KEY)
    } catch {
      /* ignore */
    }
  }
  emit()
}

/** Loads the key from native storage. Registered with the bootstrap so nothing renders before it is known. */
export const keyReady: Promise<void> = isNative()
  ? FlotsamNative.getApiKey()
      .then((r) => {
        nativeKey = r.value
        emit()
      })
      .catch(() => {})
  : Promise.resolve()
registerBootstrap(keyReady)

/** Tests/other code can reset the in-memory copy (the native copy is cleared through clearApiKey). */
export function resetKeyMemory(): void {
  nativeKey = ''
  emit()
}

const subscribe = (cb: () => void) => (listeners.add(cb), () => listeners.delete(cb))
export const useSignedIn = (): boolean => useSyncExternalStore(subscribe, () => getApiKey() !== '')
