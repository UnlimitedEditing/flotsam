import { useState } from 'react'
import { probeWorkflows } from '../api/probe'
import { clearApiKey, getApiKey } from '../api/storage'
import { engine } from '../jobs/instance'
import { setPrefs, usePrefs } from '../state/prefs'

const VERSION = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? 'dev'

export default function Settings({ onSignOut }: { onSignOut: () => void }) {
  const prefs = usePrefs()
  const key = getApiKey()
  const [probe, setProbe] = useState('')
  const [busy, setBusy] = useState(false)

  return (
    <main className="page">
      <h1>Settings</h1>

      <h2>Account</h2>
      <p className="muted">API key ending …{key.slice(-4)}</p>
      <button
        className="ghost"
        onClick={() => {
          clearApiKey()
          onSignOut()
        }}
      >
        Sign out
      </button>

      <h2>Content</h2>
      <label className="toggle">
        <input
          type="checkbox"
          checked={prefs.blurNsfw}
          onChange={(e) => setPrefs({ blurNsfw: e.target.checked })}
        />
        <span>Blur media until tapped</span>
      </label>
      <label className="toggle">
        <input
          type="checkbox"
          checked={prefs.showAdult}
          onChange={(e) => setPrefs({ showAdult: e.target.checked })}
        />
        <span>Show adult workflows (their results are always blurred until tapped)</span>
      </label>

      <h2>Appearance</h2>
      <div className="row">
        {(['dark', 'light'] as const).map((t) => (
          <button key={t} className={prefs.theme === t ? '' : 'ghost'} onClick={() => setPrefs({ theme: t })}>
            {t === 'dark' ? 'Dark' : 'Light'}
          </button>
        ))}
      </div>

      <h2>Notifications</h2>
      <p className="muted">Render-ready alerts arrive with the installable app (later phases).</p>

      <h2>Data on this device</h2>
      <button className="ghost" onClick={() => engine.clearAll()}>
        Clear finished jobs
      </button>

      {import.meta.env.DEV && (
        <>
          <h2>Developer</h2>
          <button
            className="ghost"
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                setProbe(await probeWorkflows())
              } catch (e) {
                setProbe((e as Error).message)
              } finally {
                setBusy(false)
              }
            }}
          >
            {busy ? 'Probing…' : 'Probe workflows API shape'}
          </button>
          {probe && <pre className="probe">{probe}</pre>}
        </>
      )}

      <p className="muted version">Flotsam {VERSION}</p>
    </main>
  )
}
