import { promptInstall, useInstallState } from '../pwa/install'
import { setPrefs, usePrefs } from '../state/prefs'

/** Shown only when installing is possible and the app is not already installed. */
export default function InstallCard() {
  const { iosHintDismissed } = usePrefs()
  const state = useInstallState(iosHintDismissed)

  if (state === 'prompt') {
    return (
      <div className="install-card">
        <p>Install Flotsam on your home screen for a full-screen app.</p>
        <button onClick={() => void promptInstall()}>Install app</button>
      </div>
    )
  }
  if (state === 'ios-hint') {
    return (
      <div className="install-card">
        <p>
          To install: tap the Share button in Safari, then <strong>Add to Home Screen</strong>.
        </p>
        <button className="ghost" onClick={() => setPrefs({ iosHintDismissed: true })}>
          Got it
        </button>
      </div>
    )
  }
  return null
}
