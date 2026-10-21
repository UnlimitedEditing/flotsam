import { useSyncExternalStore } from 'react'
import type { ResolvedMedia } from '../api/types'
import { idbStore, onStoreWipe, type KeyValueStore } from '../jobs/store'
import type { Job, NewJob } from '../jobs/types'

// The rig builder: turns one head image into a puppet by chaining five Graydient renders.
//   four "parts" renders (mouth, idle expressions, eyes, brows: one 3x3 sheet each) run one after another,
//   then one "pack" render takes the four sheets and returns the finished puppet.
// The chain is driven from here, not from a screen, so it keeps going when the user leaves the builder, and its
// state is saved so a closed app picks up where it was. The job engine does the actual rendering (one at a time).

export const PARTS = ['mouth', 'idle', 'eyes', 'brows'] as const
export type PartKey = (typeof PARTS)[number]
export type StepKey = PartKey | 'pack'
export const STEPS: StepKey[] = [...PARTS, 'pack']

export const DEFAULT_PARTS_SLUG = 'rig-puppet-parts'
export const DEFAULT_PACK_SLUG = 'rig-puppet-pack'
export const DEFAULT_SEED = 2102

export type StepStatus = 'waiting' | 'running' | 'done' | 'failed' | 'canceled'

export interface BuildStep {
  jobId?: string
  status: StepStatus
  error?: string
  urls?: string[] // what the render returned
}

export interface Build {
  id: string
  createdAt: number
  name: string
  imageUrl: string
  seed: number
  partsSlug: string
  packSlug: string
  nsfw: boolean
  steps: Record<StepKey, BuildStep>
  phase: 'running' | 'done' | 'failed' | 'canceled'
  error?: string
  packMedia?: ResolvedMedia[] // the finished puppet's result images
}

export interface StartParams {
  name: string
  imageUrl: string
  seed?: number
  partsSlug?: string
  packSlug?: string
  nsfw?: boolean
}

/** The slice of the job engine the builder uses (so it can be tested without one). */
export interface JobSource {
  getJobs(): Job[]
  subscribe(fn: (jobs: Job[]) => void): () => void
  enqueue(input: NewJob): Promise<Job>
  cancel(id: string): Promise<void>
  retry(id: string): Promise<Job | null>
  ready?(): Promise<void>
}

export class BuildError extends Error {}

const SLUG = /^[a-z0-9][a-z0-9_-]{1,60}$/
const KEY = 'rigbuild.v1'

export function partCommand(slug: string, part: PartKey, seed: number): string {
  return `/workflow /run:${slug} /slot1:${part} /seed:${seed}`
}

export function packCommand(slug: string): string {
  return `/workflow /run:${slug} /image1:URL1 /image2:URL2 /image3:URL3 /image4:URL4`
}

const emptySteps = (): Record<StepKey, BuildStep> => ({
  mouth: { status: 'waiting' },
  idle: { status: 'waiting' },
  eyes: { status: 'waiting' },
  brows: { status: 'waiting' },
  pack: { status: 'waiting' },
})

export class RigBuildController {
  private state: Build | null = null
  private listeners = new Set<() => void>()
  private chain: Promise<unknown> = Promise.resolve()
  private jobs: JobSource
  private store: KeyValueStore
  private now: () => number
  private loaded: Promise<void>

  constructor(jobs: JobSource, store: KeyValueStore, now: () => number = Date.now) {
    this.jobs = jobs
    this.store = store
    this.now = now
    this.loaded = this.restore()
    jobs.subscribe(() => this.schedule(() => this.advance()))
  }

  get(): Build | null {
    return this.state
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  /** Forget the build and everything remembered about it (used by "Clear all data"). */
  reset(): void {
    this.state = null
    this.emit()
  }

  ready(): Promise<void> {
    return this.loaded
  }

  async start(p: StartParams): Promise<Build> {
    await this.loaded
    if (this.state?.phase === 'running') throw new BuildError('A puppet is already being built.')
    const partsSlug = p.partsSlug ?? DEFAULT_PARTS_SLUG
    const packSlug = p.packSlug ?? DEFAULT_PACK_SLUG
    const seed = p.seed ?? DEFAULT_SEED
    if (!SLUG.test(partsSlug) || !SLUG.test(packSlug))
      throw new BuildError('The workflow names are not valid.')
    if (!Number.isInteger(seed) || seed < 0 || seed > 2_147_483_647)
      throw new BuildError('The seed must be a whole number.')
    if (!/^https?:\/\//i.test(p.imageUrl.trim())) throw new BuildError('Choose a head image first.')
    const build: Build = {
      id: Math.random().toString(36).slice(2) + this.now().toString(36),
      createdAt: this.now(),
      name: p.name.trim().slice(0, 80) || 'My puppet',
      imageUrl: p.imageUrl.trim(),
      seed,
      partsSlug,
      packSlug,
      nsfw: !!p.nsfw,
      steps: emptySteps(),
      phase: 'running',
    }
    this.state = build
    await this.persist()
    // enqueued in order: the engine runs the oldest queued job first
    for (const part of PARTS) {
      const job = await this.jobs.enqueue({
        workflowSlug: partsSlug,
        workflowName: `${build.name}: ${part}`,
        prompt: `Puppet part sheet: ${part}`,
        command: partCommand(partsSlug, part, seed),
        imageUrl: build.imageUrl,
        source: { initImage: build.imageUrl, initImageUrl: build.imageUrl },
        nsfw: build.nsfw,
      })
      this.state = {
        ...this.state!,
        steps: { ...this.state!.steps, [part]: { jobId: job.id, status: 'waiting' } },
      }
      this.emit()
    }
    await this.persist()
    this.schedule(() => this.advance())
    return this.state!
  }

  /** Re-run the step that failed (a new job with the same inputs), and carry on from there. */
  async retry(): Promise<void> {
    await this.loaded
    const b = this.state
    if (!b || b.phase === 'running' || b.phase === 'done') return
    const failed = STEPS.find((s) => b.steps[s].status === 'failed' || b.steps[s].status === 'canceled')
    if (!failed) return
    const old = b.steps[failed].jobId
    const job = old ? await this.jobs.retry(old) : null
    if (!job) {
      // the old job is gone from the history: rebuild the step from the build's own inputs
      if (failed === 'pack') await this.enqueuePack(b)
      else await this.enqueuePart(b, failed)
    } else {
      this.state = { ...b, steps: { ...b.steps, [failed]: { jobId: job.id, status: 'waiting' } } }
    }
    this.state = { ...this.state!, phase: 'running', error: undefined }
    await this.persist()
    this.emit()
    this.schedule(() => this.advance())
  }

  /** Stop: cancel whatever has not finished. */
  async cancel(): Promise<void> {
    await this.loaded
    const b = this.state
    if (!b || b.phase !== 'running') return
    await this.cancelUnfinished(b)
    this.state = { ...this.state!, phase: 'canceled' }
    await this.persist()
    this.emit()
  }

  /** Clear a finished, failed or canceled build so a new one can start. */
  async dismiss(): Promise<void> {
    await this.loaded
    if (this.state?.phase === 'running') return
    this.state = null
    await this.persist()
    this.emit()
  }

  // ── internals ──

  private schedule(fn: () => Promise<void>) {
    this.chain = this.chain.then(fn, fn).catch(() => {})
  }

  private emit() {
    this.listeners.forEach((l) => l())
  }

  private async persist() {
    await this.store.write(KEY, this.state)
  }

  private async restore() {
    const saved = await this.store.read<Build | null>(KEY, null)
    if (saved && typeof saved === 'object' && saved.steps) this.state = saved
    this.emit()
    await this.jobs.ready?.()
    this.schedule(() => this.advance())
  }

  private async cancelUnfinished(b: Build) {
    for (const s of STEPS) {
      const step = b.steps[s]
      if (step.jobId && (step.status === 'running' || step.status === 'waiting'))
        await this.jobs.cancel(step.jobId)
    }
  }

  private async enqueuePart(b: Build, part: PartKey) {
    const job = await this.jobs.enqueue({
      workflowSlug: b.partsSlug,
      workflowName: `${b.name}: ${part}`,
      prompt: `Puppet part sheet: ${part}`,
      command: partCommand(b.partsSlug, part, b.seed),
      imageUrl: b.imageUrl,
      source: { initImage: b.imageUrl, initImageUrl: b.imageUrl },
      nsfw: b.nsfw,
    })
    this.state = {
      ...this.state!,
      steps: { ...this.state!.steps, [part]: { jobId: job.id, status: 'waiting' } },
    }
  }

  private async enqueuePack(b: Build) {
    const urls = PARTS.map((p) => b.steps[p].urls?.[0])
    if (urls.some((u) => !u)) throw new BuildError('A part sheet is missing.')
    const placeholders = Object.fromEntries(urls.map((u, i) => [`URL${i + 1}`, u as string]))
    const job = await this.jobs.enqueue({
      workflowSlug: b.packSlug,
      workflowName: `${b.name}: puppet`,
      prompt: `Pack the puppet: ${b.name}`,
      command: packCommand(b.packSlug),
      imageUrl: urls[0],
      source: { placeholders },
      nsfw: b.nsfw,
      output: { carrier: 'm3ds', expect: 'rig2d' },
    })
    this.state = {
      ...this.state!,
      steps: { ...this.state!.steps, pack: { jobId: job.id, status: 'waiting' } },
    }
  }

  /** Reads the jobs and moves the build on: record results, start the pack render, detect failure or completion. */
  private async advance() {
    await this.loaded
    let b = this.state
    if (!b || b.phase !== 'running') return
    const jobs = this.jobs.getJobs()
    const steps = { ...b.steps }
    let failure: string | null = null
    let changed = false

    for (const key of STEPS) {
      const step = steps[key]
      if (!step.jobId || step.status === 'done') continue
      const job = jobs.find((j) => j.id === step.jobId)
      let next: BuildStep = step
      if (!job) next = { ...step, status: 'failed', error: 'This render was removed from the history.' }
      else if (job.status === 'done') {
        const urls = job.media.map((m) => m.url)
        next =
          key !== 'pack' && urls.length !== 1
            ? { ...step, status: 'failed', error: `Expected one sheet, got ${urls.length}.`, urls }
            : { ...step, status: 'done', urls, error: undefined }
      } else if (job.status === 'failed')
        next = { ...step, status: 'failed', error: job.error ?? 'The render failed.' }
      else if (job.status === 'canceled') next = { ...step, status: 'canceled' }
      else if (job.status === 'queued') {
        if (step.status !== 'waiting') next = { ...step, status: 'waiting' } // behind another render
      } else if (step.status !== 'running') next = { ...step, status: 'running' }
      if (next !== step) {
        steps[key] = next
        changed = true
      }
      if ((next.status === 'failed' || next.status === 'canceled') && !failure) {
        failure = next.status === 'canceled' ? 'A render was canceled.' : (next.error ?? 'A render failed.')
      }
    }

    if (failure) {
      b = { ...b, steps, phase: 'failed', error: failure }
      this.state = b
      await this.cancelUnfinished(b) // do not keep rendering sheets for a build that cannot finish
      await this.persist()
      this.emit()
      return
    }

    if (PARTS.every((p) => steps[p].status === 'done') && !steps.pack.jobId) {
      this.state = { ...b, steps }
      try {
        await this.enqueuePack(this.state)
      } catch (e) {
        this.state = { ...this.state!, phase: 'failed', error: (e as Error).message }
      }
      await this.persist()
      this.emit()
      return
    }

    if (steps.pack.status === 'done') {
      const job = jobs.find((j) => j.id === steps.pack.jobId)
      this.state = { ...b, steps, phase: 'done', packMedia: job?.media ?? [] }
      await this.persist()
      this.emit()
      return
    }

    if (changed) {
      this.state = { ...b, steps }
      await this.persist()
      this.emit()
    }
  }
}

// the app's controller, on the app's engine and store
let instance: RigBuildController | null = null
export async function getBuilder(): Promise<RigBuildController> {
  if (instance) return instance
  const { engine } = await import('../jobs/instance')
  instance = new RigBuildController(engine, idbStore)
  onStoreWipe(() => instance?.reset())
  return instance
}

/** The current build (or null), live. Starts the controller the first time it is used. */
export function useRigBuild(): Build | null {
  return useSyncExternalStore(
    (cb) => {
      let off = () => {}
      let stopped = false
      void getBuilder().then((c) => {
        if (stopped) return
        off = c.subscribe(cb)
        cb()
      })
      return () => {
        stopped = true
        off()
      }
    },
    () => instance?.get() ?? null,
  )
}
