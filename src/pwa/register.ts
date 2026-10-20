import { useSyncExternalStore } from 'react'
import { registerSW } from 'virtual:pwa-register'

// Service worker registration with an explicit "update ready" state. registerType is 'prompt', so a new
// version waits until the user taps Reload (the banner disables that while a render is running).
let needRefresh = false
let updateSW: ((reloadPage?: boolean) => Promise<void>) | undefined
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function initPwa(): void {
  if (import.meta.env.DEV || !('serviceWorker' in navigator)) return
  updateSW = registerSW({
    onNeedRefresh() {
      needRefresh = true
      emit()
    },
  })
}

export function applyUpdate(): void {
  void updateSW?.(true)
}

export function useUpdateReady(): boolean {
  return useSyncExternalStore(
    (cb) => (listeners.add(cb), () => listeners.delete(cb)),
    () => needRefresh,
  )
}
