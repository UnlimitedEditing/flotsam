import { isNative } from './platform'
import { FlotsamNative } from './plugin'

/** Fingerprint / face unlock via Android's BiometricPrompt. Always false on the web. */
export async function biometricAvailable(): Promise<boolean> {
  if (!isNative()) return false
  try {
    return (await FlotsamNative.biometricAvailable()).available
  } catch {
    return false
  }
}

/** True only if the user authenticated. Cancelling, or choosing "Use PIN", returns false. */
export async function biometricAuth(title: string): Promise<boolean> {
  if (!isNative()) return false
  try {
    return (await FlotsamNative.biometricAuth({ title })).success
  } catch {
    return false
  }
}
