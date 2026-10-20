import { lazy, Suspense, useState } from 'react'
import { engine } from '../jobs/instance'
import { isFinished, type Job } from '../jobs/types'
import type { OutputSpec } from '../m3ds/registry'
import MediaThumb from './MediaThumb'

// The decoder, viewers and three.js load only when a result is opened.
const M3dsPanel = lazy(() => import('../m3ds/M3dsPanel'))

const LABEL: Record<Job['status'], string> = {
  queued: 'Queued',
  submitting: 'Sending…',
  running: 'Rendering…',
  done: 'Done',
  failed: 'Failed',
  canceled: 'Canceled',
}

const hasPixelMedia = (job: Job) =>
  job.media.some((m) => !/\.(mp4|webm|mov|mp3|wav|ogg|flac|m4a)(\?|$)/i.test(m.url))

export default function JobCard({
  job,
  onOpen,
  highlight,
}: {
  job: Job
  onOpen?: (jobId: string, index: number) => void
  highlight?: boolean
}) {
  const finished = isFinished(job.status)
  const [panel, setPanel] = useState<OutputSpec | null>(null)
  const declared = job.status === 'done' ? job.output : undefined
  // Workflows not marked as M3DS can still be tried by hand: the decoder just checks for the header.
  const canTry = job.status === 'done' && !declared && hasPixelMedia(job)

  return (
    <article id={`job-${job.id}`} className={`job ${job.status}${highlight ? ' highlight' : ''}`}>
      <header>
        <strong>{job.workflowName}</strong>
        <span className="status">{LABEL[job.status]}</span>
      </header>
      <p className="prompt">{job.prompt || <span className="muted">(no prompt)</span>}</p>
      {job.status === 'running' && job.estimatedRenderTime ? (
        <p className="muted">
          About {Math.round(job.estimatedRenderTime)}s. First runs of a new workflow can take much longer.
        </p>
      ) : null}
      {job.error && <p className="error">{job.error}</p>}
      {declared && (
        <button className="view-result" onClick={() => setPanel(declared)}>
          View result
        </button>
      )}
      {job.media.length > 0 && (
        <div className={`grid${declared ? ' carrier' : ''}`}>
          {job.media.map((m, i) => (
            <MediaThumb key={m.url} media={m} forceBlur={job.nsfw} onOpen={() => onOpen?.(job.id, i)} />
          ))}
        </div>
      )}
      <div className="row">
        {!finished && (
          <button className="ghost" onClick={() => void engine.cancel(job.id)}>
            Cancel
          </button>
        )}
        {(job.status === 'failed' || job.status === 'canceled') && (
          <button onClick={() => void engine.retry(job.id)}>Retry</button>
        )}
        {canTry && (
          <button className="ghost" onClick={() => setPanel({ carrier: 'm3ds', expect: 'unknown' })}>
            Open as M3DS
          </button>
        )}
        {finished && (
          <button className="ghost" onClick={() => engine.remove(job.id)}>
            Remove
          </button>
        )}
      </div>
      {panel && (
        <Suspense fallback={null}>
          <M3dsPanel media={job.media} spec={panel} title={job.workflowName} onClose={() => setPanel(null)} />
        </Suspense>
      )}
    </article>
  )
}
