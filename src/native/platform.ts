import { Capacitor } from '@capacitor/core'

/** True only inside the Android app (the Capacitor shell). False on the web/PWA and in unit tests. */
export const isNative = (): boolean => {
  try {
    return Capacitor.isNativePlatform()
  } catch {
    return false
  }
}
