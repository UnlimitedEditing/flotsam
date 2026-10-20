import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { imageWorkflows, base64ToBlob } from '../lib/shareTargets'
import { resizeImage } from '../images/resize'
import { getImageHost } from '../images/hosts/registry'
import { FlotsamNative } from '../native/plugin'
import { usePrefs } from '../state/prefs'
import { useWorkflows } from '../state/useWorkflows'

/**
 * "Share to Flotsam": an image from another app (already downscaled and held in private storage by the native
 * layer). It is uploaded to the user's chosen image host, then they pick a workflow to use it with.
 */
export default function Share() {
  const navigate = useNavigate()
  const { showAdult } = usePrefs()
  const { workflows } = useWorkflows()
  const [blob, setBlob] = useState<Blob | null>(null)
  const [preview, setPreview] = useState('')
  const [url, setUrl] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [q, setQ] = useState('')
  const host = getImageHost()

  useEffect(() => {
    let alive = true
    void FlotsamNative.takeShared().then(({ images }) => {
      if (!alive || images.length === 0) return
      const b = base64ToBlob(images[0].base64, images[0].mime)
      setBlob(b)
      setPreview(URL.createObjectURL(b))
    })
    return () => {
      alive = false
    }
  }, [])

  useEffect(() => () => (preview ? URL.revokeObjectURL(preview) : undefined), [preview])

  const targets = useMemo(() => imageWorkflows(workflows, showAdult, q), [workflows, showAdult, q])

  async function upload() {
    if (!blob || !host) return
    setBusy(true)
    setErr('')
    try {
      setUrl(await host.upload(await resizeImage(blob), `shared-${Date.now()}.jpg`))
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="page">
      <h1>Shared image</h1>
      {!blob && (
        <p className="muted">No shared image is waiting. Share a photo to Flotsam from another app.</p>
      )}
      {preview && <img className="share-preview" src={preview} alt="" />}

      {blob && !host && (
        <p className="muted">
          Graydient reads images from a link, so a photo has to be uploaded first. Choose an image host in{' '}
          <Link to="/settings">Settings</Link>, then come back.
        </p>
      )}
      {blob && host && !url && (
        <button onClick={() => void upload()} disabled={busy}>
          {busy ? 'Uploading…' : `Upload with ${host.label}`}
        </button>
      )}
      {err && <p className="error">{err}</p>}

      {url && (
        <>
          <h2>Use it with…</h2>
          <input
            type="search"
            placeholder="Search workflows"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <ul className="list">
            {targets.slice(0, 100).map((w) => (
              <li key={w.slug} className="wf">
                <div className="wf-main">
                  <strong>{w.name}</strong>
                </div>
                <button
                  className="small"
                  onClick={() => navigate(`/?wf=${encodeURIComponent(w.slug)}`, { state: { imageUrl: url } })}
                >
                  Use
                </button>
              </li>
            ))}
          </ul>
          {targets.length === 0 && <p className="muted">No workflow that takes an input image matches.</p>}
        </>
      )}
    </main>
  )
}
