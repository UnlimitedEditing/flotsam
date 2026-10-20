import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import JobCard from '../components/JobCard'
import Lightbox from '../components/Lightbox'
import { resolveImage } from '../images/resolve'
import { InvalidImageUrlError, NeedsImageHostError } from '../images/types'
import { engine, useJobs } from '../jobs/instance'
import { buildRequest, emptyForm, missingRequired, unsupportedSlots, type FormValues } from '../lib/command'
import { classify, validateNumber, type MediaSlot } from '../lib/schema'
import { isVisible } from '../lib/visibility'
import { noteRecent, usePrefs } from '../state/prefs'
import { useWorkflows } from '../state/useWorkflows'

const PRESETS: Array<[number, number]> = [
  [512, 512],
  [768, 768],
  [1024, 1024],
  [1024, 576],
  [576, 1024],
  [1280, 720],
  [720, 1280],
]

export default function Chat() {
  const jobs = useJobs()
  const { workflows } = useWorkflows()
  const prefs = usePrefs()
  const [params] = useSearchParams()
  const location = useLocation()

  const slug = params.get('wf') ?? prefs.lastWorkflow ?? ''
  const workflow = useMemo(
    () => workflows.find((w) => w.slug === slug && isVisible(w, prefs.showAdult)),
    [workflows, slug, prefs.showAdult],
  )
  const schema = useMemo(() => (workflow ? classify(workflow) : null), [workflow])

  const [formBySlug, setFormBySlug] = useState<Record<string, FormValues>>({})
  const form = formBySlug[slug] ?? emptyForm()
  const setForm = (patch: Partial<FormValues>) =>
    setFormBySlug({ ...formBySlug, [slug]: { ...form, ...patch } })

  const handedImage = (location.state as { imageUrl?: string } | null)?.imageUrl
  const [showOptions, setShowOptions] = useState(false)
  const [pickerSlot, setPickerSlot] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const [lb, setLb] = useState<{ jobId: string; index: number } | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  const timeline = useMemo(() => [...jobs].sort((a, b) => a.createdAt - b.createdAt), [jobs])
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [timeline.length])

  // "Use as input" hands over one image URL; it fills the first image slot until the user edits that slot.
  const firstImageSlot = schema?.media.find((m) => m.kind === 'image' && m.via !== 'unsupported')
  const [pendingImage, setPendingImage] = useState(handedImage ?? '')
  const mediaValue = (slotId: string) =>
    form.media[slotId] ?? (slotId === firstImageSlot?.id ? pendingImage : '')

  const previous = useMemo(
    () =>
      jobs.flatMap((j) => j.media.filter((m) => !/\.(mp4|webm|mov|mp3|wav)(\?|$)/i.test(m.url))).slice(0, 12),
    [jobs],
  )

  const numericErrors: Record<string, string | null> = {}
  if (schema) {
    for (const o of schema.options) {
      numericErrors[o.field] = o.numeric ? validateNumber(form.options[o.field] ?? '', o.min, o.max) : null
    }
    if (schema.size?.mode === 'wh') {
      numericErrors.width = validateNumber(form.width, schema.size.min, schema.size.max)
      numericErrors.height = validateNumber(form.height, schema.size.min, schema.size.max)
    }
  }
  const invalid = Object.values(numericErrors).some(Boolean)
  const effectiveForm: FormValues = {
    ...form,
    media: {
      ...form.media,
      ...(firstImageSlot ? { [firstImageSlot.id]: mediaValue(firstImageSlot.id) } : {}),
    },
  }
  const missing = schema ? missingRequired(schema, effectiveForm) : []

  async function onFile(slot: MediaSlot, file: File | undefined) {
    if (!file) return
    setErr('')
    try {
      // An image host arrives with Settings; until one is configured this explains what to do.
      const url = await resolveImage({ kind: 'file', blob: file, name: file.name })
      setForm({ media: { ...form.media, [slot.id]: url } })
    } catch (e) {
      setErr(e instanceof NeedsImageHostError ? e.message : (e as Error).message)
    }
  }

  async function send() {
    if (!workflow || !schema) return
    setErr('')
    const media: Record<string, string> = {}
    try {
      for (const [id, url] of Object.entries(effectiveForm.media)) {
        if (url.trim()) media[id] = await resolveImage({ kind: 'url', url })
      }
    } catch (e) {
      setErr(e instanceof InvalidImageUrlError ? e.message : (e as Error).message)
      return
    }
    const { command, source } = buildRequest(workflow, schema, { ...form, media })
    noteRecent(workflow.slug)
    await engine.enqueue({
      workflowSlug: workflow.slug,
      workflowName: workflow.name,
      prompt: form.prompt.trim(),
      command,
      imageUrl: source.initImageUrl ?? Object.values(source.placeholders ?? {})[0],
      source,
      nsfw: workflow.is_nsfw === true,
    })
    setForm({ prompt: '' })
  }

  const lbJob = lb ? jobs.find((j) => j.id === lb.jobId) : undefined
  const optionPanel = !!schema && (schema.options.length > 0 || !!schema.size || !!schema.negativeField)

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
          {optionPanel && (
            <button className="ghost small" onClick={() => setShowOptions(!showOptions)}>
              {showOptions ? 'Hide options' : 'Options'}
            </button>
          )}
        </div>

        {schema?.media
          .filter((s) => s.via !== 'unsupported')
          .map((slot) => (
            <div className="image-box" key={slot.id}>
              <input
                type="url"
                inputMode="url"
                placeholder={`${slot.label}${slot.required ? '' : ' (optional)'} URL`}
                value={mediaValue(slot.id)}
                onChange={(e) => setForm({ media: { ...form.media, [slot.id]: e.target.value } })}
              />
              {slot.kind === 'image' && (
                <div className="row">
                  <button
                    className="ghost small"
                    onClick={() => setPickerSlot(pickerSlot === slot.id ? null : slot.id)}
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
                      onChange={(e) => void onFile(slot, e.target.files?.[0])}
                    />
                  </label>
                </div>
              )}
              {pickerSlot === slot.id && (
                <div className="strip">
                  {previous.map((m) => (
                    <button
                      key={m.url}
                      type="button"
                      className="strip-item"
                      onClick={() => {
                        setForm({ media: { ...form.media, [slot.id]: m.url } })
                        setPickerSlot(null)
                      }}
                    >
                      <img
                        src={m.url}
                        alt=""
                        loading="lazy"
                        className={prefs.blurNsfw ? 'blurred-img' : ''}
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}

        {schema && unsupportedSlots(schema).length > 0 && (
          <p className="muted small-note">
            This workflow also takes{' '}
            {unsupportedSlots(schema)
              .map((s) => s.label)
              .join(', ')}
            , which Flotsam can&apos;t send yet.
          </p>
        )}

        {showOptions && schema && (
          <div className="options">
            {schema.size?.mode === 'wh' && (
              <div className="size">
                <span>
                  Size{' '}
                  <span className="muted">
                    {schema.size.min ?? ''}–{schema.size.max ?? ''}, default {schema.size.defaultW}×
                    {schema.size.defaultH}
                  </span>
                </span>
                <div className="row">
                  <input
                    inputMode="numeric"
                    placeholder={String(schema.size.defaultW ?? 'width')}
                    value={form.width}
                    onChange={(e) => setForm({ width: e.target.value })}
                    aria-label="Width"
                  />
                  <span>×</span>
                  <input
                    inputMode="numeric"
                    placeholder={String(schema.size.defaultH ?? 'height')}
                    value={form.height}
                    onChange={(e) => setForm({ height: e.target.value })}
                    aria-label="Height"
                  />
                </div>
                <div className="presets">
                  {PRESETS.filter(
                    ([w, h]) =>
                      (schema.size!.min == null || Math.min(w, h) >= schema.size!.min) &&
                      (schema.size!.max == null || Math.max(w, h) <= schema.size!.max),
                  ).map(([w, h]) => (
                    <button
                      key={`${w}x${h}`}
                      type="button"
                      className="ghost small"
                      onClick={() => setForm({ width: String(w), height: String(h) })}
                    >
                      {w}×{h}
                    </button>
                  ))}
                </div>
                {(numericErrors.width || numericErrors.height) && (
                  <span className="error">{numericErrors.width ?? numericErrors.height}</span>
                )}
              </div>
            )}
            {schema.size?.mode === 'size' && (
              <label>
                <span>Size</span>
                <input
                  placeholder="e.g. 1024x1024"
                  value={form.sizeText}
                  onChange={(e) => setForm({ sizeText: e.target.value })}
                />
              </label>
            )}
            {schema.negativeField && (
              <input
                placeholder="Negative prompt"
                value={form.negative}
                onChange={(e) => setForm({ negative: e.target.value })}
              />
            )}
            {schema.options.map((o) => (
              <label key={o.field}>
                <span>
                  {o.label}
                  {o.help ? <span className="muted"> {o.help}</span> : null}
                  {o.min != null || o.max != null ? (
                    <span className="muted">
                      {' '}
                      ({o.min ?? ''}–{o.max ?? ''})
                    </span>
                  ) : null}
                </span>
                <input
                  inputMode={o.numeric ? 'decimal' : 'text'}
                  placeholder={o.def}
                  value={form.options[o.field] ?? ''}
                  onChange={(e) => setForm({ options: { ...form.options, [o.field]: e.target.value } })}
                />
                {o.note && <span className="muted">{o.note}</span>}
                {numericErrors[o.field] && <span className="error">{numericErrors[o.field]}</span>}
              </label>
            ))}
          </div>
        )}

        {err && <p className="error">{err}</p>}
        {missing.length > 0 && (
          <p className="muted small-note">Needs: {missing.map((m) => m.label).join(', ')}</p>
        )}
        <div className="send">
          <textarea
            rows={2}
            placeholder={workflow ? 'Prompt' : 'Choose a workflow first'}
            value={form.prompt}
            onChange={(e) => setForm({ prompt: e.target.value })}
            disabled={!workflow}
          />
          <button onClick={() => void send()} disabled={!workflow || invalid || missing.length > 0}>
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
            setLb(null)
            setPendingImage(url)
            if (firstImageSlot) setForm({ media: { ...form.media, [firstImageSlot.id]: url } })
          }}
        />
      )}
    </main>
  )
}
