import { StatusBar, Style } from '@capacitor/status-bar'
import { engine } from '../jobs/instance'
import { isFinished } from '../jobs/types'
import { refreshNativePermission } from '../pwa/notify'
import { consentReady, isConsentValid, onConsentChange } from '../state/consent'
import { getPrefs, onPrefsChange, prefsReady } from '../state/prefs'
import { isNative } from './platform'
import { FlotsamNative } from './plugin'

/**
 * Connects the web layer's settings to the Android shell. Safe to call anywhere: it does nothing on the web.
 *  - privacy cover  -> FLAG_SECURE (blocks screenshots and blanks the app-switcher thumbnail)
 *  - discreet mode  -> swaps the launcher entry to "Notes"
 *  - theme          -> status bar colours
 *  - age/terms gate -> mirrored natively so the background worker never runs before it is passed
 *  - finished jobs  -> removed from the background watch-list
 */
export function initNative(): void {
  if (!isNative()) return

  void refreshNativePermission()

  void consentReady.then(() => {
    const push = () => void FlotsamNative.setFlags({ consent: isConsentValid() }).catch(() => {})
    push()
    onConsentChange(push)
  })

  void prefsReady.then(() => {
    let secure: boolean | null = null
    let discreet: boolean | null = null
    let theme: string | null = null
    const apply = () => {
      const p = getPrefs()
      if (p.privacyScreen !== secure) {
        secure = p.privacyScreen
        void FlotsamNative.setSecure({ enabled: secure }).catch(() => {})
      }
      if (p.discreet !== discreet) {
        discreet = p.discreet
        void FlotsamNative.setDiscreet({ enabled: discreet }).catch(() => {})
      }
      if (p.theme !== theme) {
        theme = p.theme
        void StatusBar.setStyle({ style: theme === 'light' ? Style.Light : Style.Dark }).catch(() => {})
        void StatusBar.setBackgroundColor({ color: theme === 'light' ? '#ffffff' : '#0e1113' }).catch(
          () => {},
        )
      }
    }
    apply()
    onPrefsChange(apply)
  })

  // Jobs that end through the WebSocket/poll path (or are cancelled) are not seen by the native stream, so
  // tell it to stop watching them.
  const released = new Set<string>()
  engine.subscribe((jobs) => {
    for (const j of jobs) {
      if (isFinished(j.status) && !released.has(j.id)) {
        released.add(j.id)
        void FlotsamNative.unwatchRender({ jobId: j.id }).catch(() => {})
      }
    }
  })
}
