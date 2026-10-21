import { FlotsamNative } from '../native/plugin'
import { isNative } from '../native/platform'

export type Haptic = 'tap' | 'success' | 'error' | 'select'

// Vibration patterns (ms) for browsers that have navigator.vibrate (Android Chrome; iOS Safari has none).
export const WEB_PATTERNS: Record<Haptic, number | number[]> = {
  tap: 8,
  select: 5,
  success: [12, 40, 18],
  error: [30, 50, 30],
}

/** A short physical cue for a state change. Always safe to call: it does nothing where unsupported. */
export function haptic(kind: Haptic): void {
  try {
    if (isNative()) {
      void FlotsamNative.haptic({ type: kind }).catch(() => {})
    } else if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      navigator.vibrate(WEB_PATTERNS[kind])
    }
  } catch {
    /* haptics are decoration; never let them break an action */
  }
}
