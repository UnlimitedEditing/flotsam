import { useDocumentHidden } from '../pwa/visibility'
import { useAppName } from '../state/discreet'
import { usePrefs } from '../state/prefs'

/**
 * A solid cover whenever the app is not in the foreground, so an app-switcher snapshot or a glance at an
 * unattended phone shows nothing. Best effort: some systems capture their snapshot before a page can react.
 */
export default function PrivacyCover() {
  const { privacyScreen } = usePrefs()
  const hidden = useDocumentHidden()
  const name = useAppName()
  if (!privacyScreen || !hidden) return null
  return (
    <div className="privacy-cover" aria-hidden="true">
      <span>{name}</span>
    </div>
  )
}
