import { useSyncExternalStore } from 'react'

const subscribe = (cb: () => void) => {
  document.addEventListener('visibilitychange', cb)
  window.addEventListener('pagehide', cb)
  window.addEventListener('pageshow', cb)
  return () => {
    document.removeEventListener('visibilitychange', cb)
    window.removeEventListener('pagehide', cb)
    window.removeEventListener('pageshow', cb)
  }
}

export const useDocumentHidden = (): boolean =>
  useSyncExternalStore(subscribe, () => document.visibilityState === 'hidden')
