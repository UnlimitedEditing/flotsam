import { useSyncExternalStore } from 'react'
import { isNative } from '../native/platform'

// "Add to home screen". Chrome/Android fires `beforeinstallprompt`; iOS Safari has no prompt, so it gets a
// one-time hint to use Share > Add to Home Screen.

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export type InstallState = 'installed' | 'prompt' | 'ios-hint' | 'none'

export interface InstallInputs {
  standalone: boolean
  ios: boolean
  hasPrompt: boolean
  iosHintDismissed: boolean
}

/** Pure decision, kept separate so it can be tested. */
export function installState(i: InstallInputs): InstallState {
  if (i.standalone) return 'installed'
  if (i.hasPrompt) return 'prompt'
  if (i.ios && !i.iosHintDismissed) return 'ios-hint'
  return 'none'
}

export function isStandalone(): boolean {
  if (isNative()) return true // the Android app is already installed; no install prompt or hint
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

export function isIos(): boolean {
  const ua = navigator.userAgent
  return /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

let deferred: BeforeInstallPromptEvent | null = null
let version = 0
const listeners = new Set<() => void>()
const emit = () => {
  version++
  listeners.forEach((l) => l())
}

export function initInstall(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault() // we show our own button instead of the browser's mini-infobar
    deferred = e as BeforeInstallPromptEvent
    emit()
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    emit()
  })
}

export async function promptInstall(): Promise<void> {
  const e = deferred
  if (!e) return
  await e.prompt()
  await e.userChoice
  deferred = null // the event can only be used once
  emit()
}

export function useInstallState(iosHintDismissed: boolean): InstallState {
  useSyncExternalStore(
    (cb) => (listeners.add(cb), () => listeners.delete(cb)),
    () => version,
  )
  return installState({
    standalone: isStandalone(),
    ios: isIos(),
    hasPrompt: deferred !== null,
    iosHintDismissed,
  })
}
