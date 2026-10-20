import type { RenderImage, ResolvedMedia, SourceMedia } from '../api/types'
import type { StreamEvent } from '../api/stream'
import type { KeyValueStore } from './store'
import { ACTIVE, isFinished, type Job, type NewJob } from './types'

/** The slice of the API client the engine needs, injected so the engine is testable without a network. */
export interface RenderApi {
  submitRender(
    prompt: string,
    opts: { sourceMedia?: SourceMedia; signal?: AbortSignal; onEvent?: (e: StreamEvent) => void },
  ): Promise<{
    renderHash: string | null
    estimatedRenderTime: number | null
    estimatedWaitTime: number | null
    images: RenderImage[] | null
  }>
  waitForRenderEvent(hash: string, timeoutMs: number, signal?: AbortSignal): Promise<RenderImage[] | null>
  pollRenderMedia(hash: string, opts: { signal?: AbortSignal }): Promise<ResolvedMedia[]>
  cancelRender(hash: string): Promise<void>
  resolveAllMedia(images: RenderImage[] | undefined): ResolvedMedia[]
}

const STORE_KEY = 'jobs.v1'
const WS_WINDOW_MS = 20_000
const MAX_HISTORY = 200

type Listener = (jobs: Job[]) => void

/**
 * Sequential render queue. Graydient allows one render per account at a time, so exactly one job is
 * submitted at a time. A job is never auto-resubmitted: first runs of new workflows can take a very long
 * time (up to ~2000 s), and a duplicate submit would stall behind the first.
 */
export class JobEngine {
  private jobs: Job[] = []
  private listeners = new Set<Listener>()
  private active: { id: string; abort: AbortController } | null = null
  private loaded: Promise<void>
  private api: RenderApi
  private store: KeyValueStore
  private now: () => number
  private newId: () => string

  constructor(
    api: RenderApi,
    store: KeyValueStore,
    now: () => number = Date.now,
    newId: () => string = () => Math.random().toString(36).slice(2) + Date.now().toString(36),
  ) {
    this.api = api
    this.store = store
    this.now = now
    this.newId = newId
    this.loaded = this.restore()
  }

  ready(): Promise<void> {
    return this.loaded
  }

  getJobs(): Job[] {
    return this.jobs
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  async enqueue(input: NewJob): Promise<Job> {
    await this.loaded
    const job: Job = { ...input, id: this.newId(), createdAt: this.now(), status: 'queued', media: [] }
    this.update([job, ...this.jobs])
    void this.pump()
    return job
  }

  async cancel(id: string): Promise<void> {
    const job = this.jobs.find((j) => j.id === id)
    if (!job || isFinished(job.status)) return
    if (this.active?.id === id) {
      this.active.abort.abort() // run() records the canceled state
      if (job.renderHash) await this.api.cancelRender(job.renderHash)
    } else {
      this.patch(id, { status: 'canceled', finishedAt: this.now() })
    }
  }

  /** A retry is a brand-new job with the same inputs. */
  async retry(id: string): Promise<Job | null> {
    const j = this.jobs.find((x) => x.id === id)
    if (!j || !isFinished(j.status) || j.status === 'done') return null
    return this.enqueue({
      workflowSlug: j.workflowSlug,
      workflowName: j.workflowName,
      prompt: j.prompt,
      command: j.command,
      imageUrl: j.imageUrl,
      source: j.source,
      nsfw: j.nsfw,
    })
  }

  remove(id: string): void {
    if (this.active?.id === id) return
    this.update(this.jobs.filter((j) => j.id !== id))
  }

  clearAll(): void {
    this.update(this.jobs.filter((j) => this.active?.id === j.id))
  }

  // ── internals ──

  private async restore(): Promise<void> {
    const saved = await this.store.read<Job[]>(STORE_KEY, [])
    // A job that was mid-flight when the page closed cannot be re-attached unless we have its render hash.
    this.jobs = saved.map((j) =>
      ACTIVE.includes(j.status)
        ? {
            ...j,
            status: 'failed' as const,
            error: 'Interrupted (app closed). Check the Graydient app for this render.',
            finishedAt: this.now(),
          }
        : j,
    )
    this.emit()
    void this.pump()
  }

  private emit(): void {
    for (const l of this.listeners) l(this.jobs)
  }

  private update(next: Job[]): void {
    const finished = next.filter((j) => isFinished(j.status)).slice(0, MAX_HISTORY)
    this.jobs = [...next.filter((j) => !isFinished(j.status)), ...finished]
    this.emit()
    void this.store.write(STORE_KEY, this.jobs)
  }

  private patch(id: string, p: Partial<Job>): void {
    this.update(this.jobs.map((j) => (j.id === id ? { ...j, ...p } : j)))
  }

  private async pump(): Promise<void> {
    if (this.active) return
    const next = [...this.jobs].reverse().find((j) => j.status === 'queued') // oldest first
    if (!next) return
    const abort = new AbortController()
    this.active = { id: next.id, abort }
    try {
      await this.run(next, abort.signal)
    } finally {
      this.active = null
      void this.pump()
    }
  }

  private async run(job: Job, signal: AbortSignal): Promise<void> {
    const id = job.id
    this.patch(id, { status: 'submitting' })
    try {
      const sourceMedia =
        job.source ?? (job.imageUrl ? { initImage: job.imageUrl, initImageUrl: job.imageUrl } : undefined)
      const submitted = await this.api.submitRender(job.command, {
        sourceMedia,
        signal,
        onEvent: (e) => {
          if (e.name === 'render_queued') {
            this.patch(id, {
              renderHash: (e.data.render_hash as string | undefined) ?? undefined,
              estimatedRenderTime: (e.data.estimated_render_time as number | undefined) ?? null,
              estimatedWaitTime: (e.data.estimated_wait_time as number | undefined) ?? null,
              status: 'running',
            })
          } else if (e.name === 'rendering_started') {
            this.patch(id, { status: 'running' })
          }
        },
      })
      const hash = submitted.renderHash ?? this.jobs.find((j) => j.id === id)?.renderHash ?? null
      if (hash) this.patch(id, { renderHash: hash, status: 'running' })

      let media = this.api.resolveAllMedia(submitted.images ?? undefined)
      if (!media.length && hash) {
        media = this.api.resolveAllMedia(
          (await this.api.waitForRenderEvent(hash, WS_WINDOW_MS, signal)) ?? undefined,
        )
      }
      if (!media.length && hash) media = await this.api.pollRenderMedia(hash, { signal })
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
      if (!media.length)
        throw new Error(hash ? 'Render finished but returned no media.' : 'No render id was returned.')
      this.patch(id, { status: 'done', media, finishedAt: this.now() })
    } catch (e) {
      if (signal.aborted || (e as Error).name === 'AbortError') {
        this.patch(id, { status: 'canceled', finishedAt: this.now() })
      } else {
        this.patch(id, { status: 'failed', error: (e as Error).message, finishedAt: this.now() })
      }
    }
  }
}
