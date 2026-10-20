import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import JobCard from '../components/JobCard'
import Lightbox from '../components/Lightbox'
import { resolveImage } from '../images/resolve'
import { InvalidImageUrlError, NeedsImageHostError, type ImageInput } from '../images/types'
import { engine, useJobs } from '../jobs/instance'
import { buildCommand, formFields, hasNegativeField, validateOption, wantsImage } from '../lib/command'
import { noteRecent, usePrefs } from '../state/prefs'
import { useWorkflows } from '../state/useWorkflows'

export default function Chat() {
  const jobs = useJobs()
  const { workflows } = useWorkflows()
  const prefs = usePrefs()
  const [params] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()

  const slug = params.get('wf') ?? prefs.lastWorkflow ?? ''
  const workflow = useMemo(() => workflows.find((w) => w.slug === slug), [workflows, slug])

  const [prompt, setPrompt] = useState('')
  const [negative, setNegative] = useState('')
  const [optionsBySlug, setOptionsBySlug] = useState<Record<string, Record<string, string>>>({})
  const options = optionsBySlug[slug] ?? {}
  const [showOptions, setShowOptions] = useState(false)
  const [imageUrl, setImageUrl] = useState((location.state as { imageUrl?: string } | null)?.imageUrl ?? '')
  const [showPrev, setShowPrev] = useState(false)
  const [err, setErr] = useState('')
  const [lb, setLb] = useState<{ jobId: string; index: number } | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  const timeline = useMemo(() => [...jobs].sort((a, b) => a.createdAt - b.createdAt), [jobs])
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [timeline.length])

  const previous = useMemo(
    () =>
      jobs.flatMap((j) => j.media.filter((m) => !/\.(mp4|webm|mov|mp3|wav)(\?|$)/i.test(m.url))).slice(0, 12),
    [jobs],
  )

  const fields = workflow ? formFields(workflow) : []
  const fieldErrors = Object.fromEntries(
    fields.map((f) => [f.local_field, validateOption(f, options[f.local_field] ?? '')]),
  )
  const invalid = Object.values(fieldErrors).some(Boolean)
  const needsImage = workflow ? wantsImage(workflow) : false

  async function onFile(file: File | undefined) {
    if (!file) return
    setErr('')
    try {
      const input: ImageInput = { kind: 'file', blob: file, name: file.name }
      setImageUrl(await resolveImage(input)) // no image host is configured yet
    } catch (e) {
      setErr(e instanceof NeedsImageHostError ? e.message : (e as Error).message)
    }
  }

  async function send() {
    if (!workflow) return
    setErr('')
    let url: string | undefined
    if (imageUrl.trim()) {
      try {
        url = await resolveImage({ kind: 'url', url: imageUrl })
      } catch (e) {
        setErr(e instanceof InvalidImageUrlError ? e.message : (e as Error).message)
        return
      }
    }
    const command = buildCommand({
      workflowSlug: workflow.slug,
      prompt,
      negative: hasNegativeField(workflow) ? negative : undefined,
      options,
    })
    noteRecent(workflow.slug)
    await engine.enqueue({
      workflowSlug: workflow.slug,
      workflowName: workflow.name,
      prompt: prompt.trim(),
      command,
      imageUrl: url,
    })
    setPrompt('')
  }

  const lbJob = lb ? jobs.find((j) => j.id === lb.jobId) : undefined

  return (
    <main className="chat">
      <div className="messages">
        {timeline.length === 0 && (
          <p className="muted empty">Pick a workflow, type a prompt and send. Results appear here.</p>
        )}
        {timeline.map((j) => (
          <JobCard key={j.id} job={j} onOpen={(jobId, index) => setLb({ jobId, index })} />
        ))}
        <div ref={endRef} />
      </div>

      <section className="composer">
        <div className="row">
          <Link to="/workflows" className="chip">
            {workflow ? workflow.name : slug ? `${slug} (loading…)` : 'Choose a workflow'}
          </Link>
          {workflow && (fields.length > 0 || hasNegativeField(workflow)) && (
            <button className="ghost small" onClick={() => setShowOptions(!showOptions)}>
              {showOptions ? 'Hide options' : 'Options'}
            </button>
          )}
        </div>

        {needsImage && (
          <div className="image-box">
            <input
              type="url"
              inputMode="url"
              placeholder="Input image URL"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
            />
            <div className="row">
              <button
                className="ghost small"
                onClick={() => setShowPrev(!showPrev)}
                disabled={previous.length === 0}
              >
                Previous results
              </button>
              <label className="ghost small filebtn">
                Photo
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={(e) => void onFile(e.target.files?.[0])}
                />
              </label>
            </div>
            {showPrev && (
              <div className="strip">
                {previous.map((m) => (
                  <button
                    key={m.url}
                    type="button"
                    className="strip-item"
                    onClick={() => {
                      setImageUrl(m.url)
                      setShowPrev(false)
                    }}
                  >
                    <img src={m.url} alt="" loading="lazy" className={prefs.blurNsfw ? 'blurred-img' : ''} />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {showOptions && workflow && (
          <div className="options">
            {hasNegativeField(workflow) && (
              <input
                placeholder="Negative prompt"
                value={negative}
                onChange={(e) => setNegative(e.target.value)}
              />
            )}
            {fields.map((f) => (
              <label key={f.local_field}>
                <span>
                  {f.local_field}
                  {f.help_text ? <span className="muted"> {f.help_text}</span> : null}
                </span>
                <input
                  inputMode="decimal"
                  placeholder={f.default_value != null ? String(f.default_value) : ''}
                  value={options[f.local_field] ?? ''}
                  onChange={(e) =>
                    setOptionsBySlug({
                      ...optionsBySlug,
                      [slug]: { ...options, [f.local_field]: e.target.value },
                    })
                  }
                />
                {fieldErrors[f.local_field] && <span className="error">{fieldErrors[f.local_field]}</span>}
              </label>
            ))}
          </div>
        )}

        {err && <p className="error">{err}</p>}
        <div className="send">
          <textarea
            rows={2}
            placeholder={workflow ? 'Prompt' : 'Choose a workflow first'}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={!workflow}
          />
          <button
            onClick={() => void send()}
            disabled={!workflow || invalid || (needsImage && !imageUrl.trim() && workflow?.supports_img2vid)}
          >
            Send
          </button>
        </div>
      </section>

      {lb && lbJob && (
        <Lightbox
          items={lbJob.media}
          index={lb.index}
          onClose={() => setLb(null)}
          onUseAsInput={(url) => {
            setImageUrl(url)
            setLb(null)
            navigate('/', { state: { imageUrl: url }, replace: true })
          }}
        />
      )}
    </main>
  )
}
