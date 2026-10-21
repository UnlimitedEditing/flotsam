import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import JobCard from '../components/JobCard'
import Lightbox from '../components/Lightbox'
import EmptyState from '../components/ui/EmptyState'
import { engine, useJobs } from '../jobs/instance'
import { isFinished } from '../jobs/types'

export default function Queue() {
  const jobs = useJobs()
  const [params] = useSearchParams()
  const focus = params.get('job')
  // A notification tap (flotsam://job/<id>) opens the queue on that job.
  useEffect(() => {
    if (focus) document.getElementById(`job-${focus}`)?.scrollIntoView({ block: 'center' })
  }, [focus, jobs.length])
  const [lb, setLb] = useState<{ jobId: string; index: number } | null>(null)
  const live = jobs.filter((j) => !isFinished(j.status))
  const finished = jobs.filter((j) => isFinished(j.status))
  const lbJob = lb ? jobs.find((j) => j.id === lb.jobId) : undefined

  return (
    <main className="page">
      <h1>Queue</h1>
      <p className="muted">Graydient runs one render at a time, so jobs run in order.</p>
      <h2>Active ({live.length})</h2>
      {live.length === 0 && finished.length === 0 && (
        <EmptyState icon="queue" title="Quiet seas">
          <p className="muted">Renders you send show up here while they run.</p>
        </EmptyState>
      )}
      {live.length === 0 && finished.length > 0 && <p className="muted">Nothing running.</p>}
      {[...live].reverse().map((j) => (
        <JobCard key={j.id} job={j} highlight={j.id === focus} />
      ))}
      <h2>History ({finished.length})</h2>
      {finished.length > 0 && (
        <button className="ghost" onClick={() => engine.clearAll()}>
          Clear finished
        </button>
      )}
      {finished.map((j) => (
        <JobCard
          key={j.id}
          job={j}
          highlight={j.id === focus}
          onOpen={(jobId, index) => setLb({ jobId, index })}
        />
      ))}
      {lb && lbJob && <Lightbox items={lbJob.media} index={lb.index} onClose={() => setLb(null)} />}
    </main>
  )
}
