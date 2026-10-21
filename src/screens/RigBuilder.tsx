import { lazy, Suspense, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import MediaThumb from '../components/MediaThumb'
import EmptyState from '../components/ui/EmptyState'
import Icon from '../components/ui/Icon'
import { getImageHost } from '../images/hosts/registry'
import { resizeImage } from '../images/resize'
import { assertFetchableUrl, resolveImage } from '../images/resolve'
import { InvalidImageUrlError, NeedsImageHostError } from '../images/types'
import { useJobs } from '../jobs/instance'
import AddToLibraryButton from '../library/AddToLibraryButton'
import {
  BuildError,
  DEFAULT_PACK_SLUG,
  DEFAULT_PARTS_SLUG,
  DEFAULT_SEED,
  getBuilder,
  STEPS,
  useRigBuild,
  type StepKey,
  type StepStatus,
} from '../rig/builder'
import { usePrefs } from '../state/prefs'
import { useWorkflows } from '../state/useWorkflows'

const ResultPanel = lazy(() => import('../results/ResultPanel'))

const STEP_LABEL: Record<StepKey, string> = {
  mouth: 'Mouth shapes',
  idle: 'Resting expressions',
  eyes: 'Eyes',
  brows: 'Brows',
  pack: 'Assemble the puppet',
}
const STATUS_LABEL: Record<StepStatus, string> = {
  waiting: 'Waiting',
  running: 'Rendering…',
  done: 'Done',
  failed: 'Failed',
  canceled: 'Canceled',
}

const isImageUrl = (u: string) => !/\.(mp4|webm|mov|mp3|wav|ogg|flac|m4a)(\?|$)/i.test(u)

/** Turn a head image into a talking puppet: four sheet renders, then one that assembles them. */
export default function RigBuilder() {
  const build = useRigBuild()
  const jobs = useJobs()
  const prefs = usePrefs()
  const { workflows, loading } = useWorkflows()
  const navigate = useNavigate()
  const location = useLocation()

  const partsSlug = prefs.rigPartsSlug.trim() || DEFAULT_PARTS_SLUG
  const packSlug = prefs.rigPackSlug.trim() || DEFAULT_PACK_SLUG
  const wfParts = workflows.find((w) => w.slug === partsSlug)
  const wfPack = workflows.find((w) => w.slug === packSlug)
  const missing = [!wfParts && partsSlug, !wfPack && packSlug].filter(Boolean) as string[]
  const known = workflows.length > 0

  const fromState = (location.state as { imageUrl?: string } | null)?.imageUrl ?? ''
  const [image, setImage] = useState(fromState)
  const [name, setName] = useState('My puppet')
  const [seed, setSeed] = useState(String(DEFAULT_SEED))
  const [pasted, setPasted] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [preview, setPreview] = useState(false)

  // the user's own finished image results, newest first (not the builder's own sheets)
  const recent = useMemo(() => {
    const seen = new Set<string>()
    const out: Array<{ url: string; nsfw: boolean }> = []
    for (const j of jobs) {
      if (j.status !== 'done' || j.workflowSlug === partsSlug || j.workflowSlug === packSlug) continue
      if (j.output) continue // barcoded results are files, not pictures
      for (const m of j.media) {
        if (!isImageUrl(m.url) || seen.has(m.url)) continue
        seen.add(m.url)
        out.push({ url: m.url, nsfw: !!j.nsfw })
      }
    }
    return out.slice(0, 24)
  }, [jobs, partsSlug, packSlug])

  async function upload(file: File) {
    setErr('')
    setBusy(true)
    try {
      const host = getImageHost()
      const blob = host ? await resizeImage(file) : file
      setImage(await resolveImage({ kind: 'file', blob, name: file.name }, host))
    } catch (e) {
      setErr(e instanceof NeedsImageHostError ? e.message : (e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function start() {
    setErr('')
    const n = Number(seed)
    try {
      const url = await resolveImage({ kind: 'url', url: image })
      const c = await getBuilder()
      await c.start({
        name,
        imageUrl: url,
        seed: n,
        partsSlug,
        packSlug,
        nsfw: wfParts?.is_nsfw === true || wfPack?.is_nsfw === true,
      })
    } catch (e) {
      setErr(e instanceof InvalidImageUrlError || e instanceof BuildError ? e.message : (e as Error).message)
    }
  }

  // ── a build exists: show it ──
  if (build) {
    const running = build.phase === 'running'
    const doneCount = STEPS.filter((s) => build.steps[s].status === 'done').length
    return (
      <main className="page rig-builder">
        <h1>{build.name}</h1>
        {build.phase === 'done' ? (
          <p>Your puppet is ready.</p>
        ) : (
          <p className="muted">
            Graydient renders one at a time, so this takes a few minutes ({doneCount} of {STEPS.length} done).
            You can leave this screen: it keeps going, and each finished render notifies you if you turned
            that on.
          </p>
        )}
        <ol className="build-steps">
          {STEPS.map((s) => (
            <li key={s} className={`build-step ${build.steps[s].status}`}>
              <span className="build-name">{STEP_LABEL[s]}</span>
              <span className={`status pill ${build.steps[s].status}`}>
                {STATUS_LABEL[build.steps[s].status]}
              </span>
              {build.steps[s].error && <span className="error build-err">{build.steps[s].error}</span>}
            </li>
          ))}
        </ol>
        {running && (
          <div className="progress" role="progressbar" aria-label="Building">
            <span />
          </div>
        )}
        {build.phase === 'failed' && <p className="error">{build.error}</p>}
        <div className="row">
          {build.phase === 'done' && <button onClick={() => setPreview(true)}>Open puppet</button>}
          {(build.phase === 'failed' || build.phase === 'canceled') && (
            <button onClick={() => void getBuilder().then((c) => c.retry())}>Retry the failed step</button>
          )}
          {running && (
            <button className="ghost" onClick={() => void getBuilder().then((c) => c.cancel())}>
              Cancel
            </button>
          )}
          {!running && (
            <button className="ghost" onClick={() => void getBuilder().then((c) => c.dismiss())}>
              {build.phase === 'done' ? 'Make another' : 'Start over'}
            </button>
          )}
        </div>
        <p className="muted">
          <Link to="/queue">See the renders in the Queue</Link>
        </p>
        {preview && build.packMedia && (
          <Suspense fallback={null}>
            <ResultPanel
              media={build.packMedia}
              spec={{ carrier: 'm3ds', expect: 'rig2d' }}
              title={build.name}
              onClose={() => setPreview(false)}
              actions={(decoded) => (
                <AddToLibraryButton decoded={decoded} expect="rig2d" nsfw={build.nsfw} name={build.name} />
              )}
            />
          </Suspense>
        )}
      </main>
    )
  }

  // ── no build yet: choose an image and start ──
  return (
    <main className="page rig-builder">
      <h1>Make a puppet</h1>
      <p className="muted">
        Turn a head into a talking puppet you can pose and keep. It works best with a front-facing, flat
        cartoon head on a plain background. It runs five renders in a row (four sheets, then one that puts
        them together), which takes several minutes on Graydient.
      </p>

      {known && missing.length > 0 && (
        <p className="error" role="alert">
          Your Graydient account does not have {missing.map((m) => `“${m}”`).join(' and ')}. The rig builder
          needs them. If they have different names on your account, set them in Settings.
        </p>
      )}
      {!known && (
        <p className="muted">
          {loading ? 'Checking your workflows…' : 'Your workflows have not loaded yet.'}
        </p>
      )}

      <h2>1. The head</h2>
      {image ? (
        <div className="rig-chosen">
          <div className="grid">
            <MediaThumb media={{ url: image, mediaType: null, thumbnailUrl: null }} forceBlur={false} />
          </div>
          <button className="ghost small" onClick={() => setImage('')}>
            Choose another
          </button>
        </div>
      ) : (
        <>
          {recent.length > 0 ? (
            <>
              <p className="muted">From your results (tap to uncover, tap again to choose):</p>
              <div className="grid">
                {recent.map((r) => (
                  <MediaThumb
                    key={r.url}
                    media={{ url: r.url, mediaType: null, thumbnailUrl: null }}
                    forceBlur={r.nsfw}
                    onOpen={() => setImage(r.url)}
                  />
                ))}
              </div>
            </>
          ) : (
            <EmptyState icon="puppet" title="No head yet">
              <p className="muted">Render a character first, or upload or paste one below.</p>
            </EmptyState>
          )}
          <label className="filebtn">
            Upload a picture
            <input
              type="file"
              accept="image/*"
              hidden
              disabled={busy}
              onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])}
            />
          </label>
          <div className="row">
            <input
              placeholder="…or paste an image address"
              value={pasted}
              aria-label="Image address"
              onChange={(e) => setPasted(e.target.value)}
            />
            <button
              className="small"
              disabled={!pasted.trim()}
              onClick={() => {
                try {
                  setImage(assertFetchableUrl(pasted))
                  setErr('')
                } catch (e) {
                  setErr((e as Error).message)
                }
              }}
            >
              Use
            </button>
          </div>
        </>
      )}

      <h2>2. Name it</h2>
      <input value={name} maxLength={80} onChange={(e) => setName(e.target.value)} aria-label="Puppet name" />
      <details>
        <summary>Advanced</summary>
        <label className="field">
          <span className="muted">Seed (the same head and seed give the same puppet)</span>
          <input
            inputMode="numeric"
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            aria-label="Seed"
          />
        </label>
      </details>

      {err && <p className="error">{err}</p>}
      <button disabled={!image || busy || !known || missing.length > 0} onClick={() => void start()}>
        <Icon name="plus" size={18} /> Start building
      </button>
      <button className="ghost" onClick={() => navigate(-1)}>
        Back
      </button>
    </main>
  )
}
