import { engine } from '../jobs/instance'
import { isFinished, type Job } from '../jobs/types'
import MediaThumb from './MediaThumb'

const LABEL: Record<Job['status'], string> = {
  queued: 'Queued',
  submitting: 'Sending…',
  running: 'Rendering…',
  done: 'Done',
  failed: 'Failed',
  canceled: 'Canceled',
}

export default function JobCard({
  job,
  onOpen,
}: {
  job: Job
  onOpen?: (jobId: string, index: number) => void
}) {
  const finished = isFinished(job.status)
  return (
    <article className={`job ${job.status}`}>
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
      {job.media.length > 0 && (
        <div className="grid">
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
        {finished && (
          <button className="ghost" onClick={() => engine.remove(job.id)}>
            Remove
          </button>
        )}
      </div>
    </article>
  )
}
