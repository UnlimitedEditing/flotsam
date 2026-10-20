import { useState } from 'react'
import { probeWorkflows } from '../api/probe'
import { clearApiKey, getApiKey } from '../api/storage'
import { getImageHost, imageLoads, makeTestPng } from '../images/hosts/registry'
import ClearDataButton from '../components/ClearDataButton'
import InstallCard from '../components/InstallCard'
import UpdatePanel from '../components/UpdatePanel'
import LockSettings from '../components/LockSettings'
import { TERMS, TERMS_DRAFT_NOTICE, TERMS_VERSION } from '../legal/terms'
import { engine } from '../jobs/instance'
import { permissionState, requestNotifyPermission, type NotifyPermission } from '../pwa/notify'
import { appName } from '../state/discreet'
import { setPrefs, usePrefs } from '../state/prefs'

const VERSION = (import.meta.env.VITE_APP_VERSION as string | undefined) ?? 'dev'

export default function Settings({ onSignOut }: { onSignOut: () => void }) {
  const prefs = usePrefs()
  const key = getApiKey()
  const [probe, setProbe] = useState('')
  const [busy, setBusy] = useState(false)
  const [perm, setPerm] = useState<NotifyPermission>(permissionState())
  const [hostTest, setHostTest] = useState('')
  const [testing, setTesting] = useState(false)

  async function testUpload() {
    const host = getImageHost()
    if (!host) return
    setTesting(true)
    setHostTest('')
    try {
      const url = await host.upload(await makeTestPng(), 'flotsam-test.png')
      const loads = await imageLoads(url)
      setHostTest(
        loads
          ? `Upload works. The file is reachable at ${url}`
          : `Uploaded to ${url} but it did not load as an image yet. Try again in a moment.`,
      )
    } catch (e) {
      setHostTest((e as Error).message)
    } finally {
      setTesting(false)
    }
  }

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

      <h2>Privacy</h2>
      <label className="toggle">
        <input
          type="checkbox"
          checked={prefs.privacyScreen}
          onChange={(e) => setPrefs({ privacyScreen: e.target.checked })}
        />
        <span>Cover the screen when the app is in the background</span>
      </label>
      <label className="toggle">
        <input
          type="checkbox"
          checked={prefs.discreet}
          onChange={(e) => setPrefs({ discreet: e.target.checked })}
        />
        <span>Discreet mode (neutral name and notification wording)</span>
      </label>
      <p className="muted">
        The cover is best effort: some phones take their app-switcher snapshot before a page can react.
        Discreet mode changes what this page and its notifications say. It cannot rename or re-icon an
        installed home-screen app; that comes with the Android app.
      </p>

      <h2>App lock</h2>
      <LockSettings />

      <h2>Appearance</h2>
      <div className="row">
        {(['dark', 'light'] as const).map((t) => (
          <button key={t} className={prefs.theme === t ? '' : 'ghost'} onClick={() => setPrefs({ theme: t })}>
            {t === 'dark' ? 'Dark' : 'Light'}
          </button>
        ))}
      </div>

      <h2>Image host</h2>
      <p className="muted">
        Graydient can only read inputs from a URL, so photos from this device are uploaded to a host you
        choose. Flotsam does not host anything itself.
      </p>
      <div className="row">
        {(['none', 'catbox'] as const).map((h) => (
          <button
            key={h}
            className={prefs.imageHost === h ? '' : 'ghost'}
            onClick={() => setPrefs({ imageHost: h })}
          >
            {h === 'none' ? 'None' : 'Catbox'}
          </button>
        ))}
      </div>
      {prefs.imageHost === 'catbox' && (
        <>
          <p className="muted">
            Uploads go to catbox.moe under{' '}
            <a href="https://catbox.moe/" target="_blank" rel="noopener noreferrer">
              its own rules
            </a>
            , which are yours to check, including what content it allows. Optional: your own Catbox user hash
            ties uploads to your account; leave it empty to upload anonymously.
          </p>
          <input
            type="password"
            autoComplete="off"
            placeholder="Catbox user hash (optional)"
            value={prefs.catboxUserhash}
            onChange={(e) => setPrefs({ catboxUserhash: e.target.value })}
          />
          <button className="ghost" disabled={testing} onClick={() => void testUpload()}>
            {testing ? 'Testing…' : 'Test upload (sends a 1x1 pixel image)'}
          </button>
          {hostTest && <p className="muted probe">{hostTest}</p>}
        </>
      )}

      <h2>App updates</h2>
      <UpdatePanel />

      <h2>Install</h2>
      <InstallCard />
      <p className="muted">
        Installing needs the app to be served over HTTPS. On iPhone use Safari&apos;s Share menu.
      </p>

      <h2>Notifications</h2>
      <label className="toggle">
        <input
          type="checkbox"
          checked={prefs.notifyDone && perm === 'granted'}
          disabled={perm === 'unsupported' || perm === 'denied'}
          onChange={async (e) => {
            if (!e.target.checked) return setPrefs({ notifyDone: false })
            const p = perm === 'granted' ? perm : await requestNotifyPermission()
            setPerm(p)
            setPrefs({ notifyDone: p === 'granted' })
          }}
        />
        <span>Notify me when a render finishes</span>
      </label>
      <p className="muted">
        {perm === 'denied'
          ? 'Notifications are blocked for this site. Allow them in your browser settings to turn this on.'
          : perm === 'unsupported'
            ? 'This browser does not support notifications.'
            : 'Works while Flotsam is open or just moved to the background. The alert only says a render is ready; it never shows your prompt or any image. Alerts with the app fully closed need the Android app.'}
      </p>

      <h2>Terms</h2>
      <details>
        <summary>Terms and Content Policy (version {TERMS_VERSION})</summary>
        <p className="muted">{TERMS_DRAFT_NOTICE}</p>
        {TERMS.map((s) => (
          <section key={s.title}>
            <h3>{s.title}</h3>
            {s.body.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </section>
        ))}
      </details>

      <h2>Data on this device</h2>
      <button className="ghost" onClick={() => engine.clearAll()}>
        Clear finished jobs
      </button>
      <ClearDataButton />

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

      <p className="muted version">
        {appName(prefs.discreet)} {VERSION}
      </p>
    </main>
  )
}
