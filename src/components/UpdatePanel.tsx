import {
  checkForUpdate,
  installVerified,
  openInstallSettings,
  startUpdate,
  useAppUpdate,
} from '../native/updater'
import { describeProgress, isBusy, isUpdateAvailable } from '../native/updateState'

/**
 * The update controls (Android only). Used in Settings and, with `forced`, on the blocking update screen.
 * Privacy: a check tells the update host this device's IP address and app version, nothing else.
 */
export default function UpdatePanel({ forced = false }: { forced?: boolean }) {
  const u = useAppUpdate()
  if (!u.enabled) return null
  const busy = isBusy(u)
  const available = isUpdateAvailable(u)
  const m = u.manifest

  return (
    <div className="update-panel">
      <p className="muted">
        Installed version {u.installedName} ({u.installedCode})
        {u.lastCheck > 0 ? `. Last checked ${new Date(u.lastCheck).toLocaleString()}.` : '.'}
      </p>

      {available && m && (
        <div className="update-notes">
          <p>
            <strong>Version {m.versionName}</strong> is available
            {m.size > 0 ? ` (${(m.size / 1_048_576).toFixed(1)} MB)` : ''}.
          </p>
          {m.notes && <p className="muted">{m.notes}</p>}
        </div>
      )}
      {!available && u.decision === 'up_to_date' && u.phase === 'idle' && (
        <p className="muted">You have the latest version.</p>
      )}

      {(u.phase === 'downloading' || u.phase === 'verifying') && (
        <p className="muted" role="status">
          {u.phase === 'verifying'
            ? 'Checking the download…'
            : `Downloading… ${describeProgress(u.progress)}`}
        </p>
      )}
      {u.phase === 'ready' && <p className="muted">Download verified. Starting the installer…</p>}
      {u.phase === 'installing' && (
        <p className="muted" role="status">
          Confirm the installation on the screen Android shows. The app will restart when it is done.
        </p>
      )}
      {u.phase === 'needsPermission' && (
        <div className="update-permission">
          <p>Android needs your permission before this app can install updates.</p>
          <div className="row">
            <button onClick={() => void openInstallSettings()}>Open settings</button>
            <button className="ghost" onClick={() => void installVerified()}>
              I&apos;ve allowed it
            </button>
          </div>
        </div>
      )}
      {u.phase === 'error' && u.error && <p className="error">{u.error}</p>}

      <div className="row">
        {available && !busy && u.phase !== 'needsPermission' && (
          <button onClick={() => void startUpdate()}>
            {u.phase === 'error' ? 'Try again' : 'Update now'}
          </button>
        )}
        {!forced && (
          <button className="ghost" disabled={busy} onClick={() => void checkForUpdate(false)}>
            {u.phase === 'checking' ? 'Checking…' : 'Check for updates'}
          </button>
        )}
        {forced && !available && (
          <button className="ghost" disabled={busy} onClick={() => void checkForUpdate(false)}>
            Check again
          </button>
        )}
      </div>
    </div>
  )
}
