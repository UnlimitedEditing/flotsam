import { describe, expect, it } from 'vitest'
import { memoryStore } from '../jobs/store'
import type { Job, NewJob } from '../jobs/types'
import {
  BuildError,
  DEFAULT_PACK_SLUG,
  DEFAULT_PARTS_SLUG,
  packCommand,
  partCommand,
  PARTS,
  RigBuildController,
  type JobSource,
} from './builder'

// A stand-in for the job engine: jobs stay queued until the test finishes them.
class FakeJobs implements JobSource {
  jobs: Job[] = []
  listeners = new Set<(j: Job[]) => void>()
  seq = 0
  getJobs = () => this.jobs
  subscribe(fn: (j: Job[]) => void) {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  private emit() {
    this.listeners.forEach((l) => l(this.jobs))
  }
  async enqueue(input: NewJob) {
    const job: Job = { ...input, id: `job${++this.seq}`, createdAt: 0, status: 'queued', media: [] }
    this.jobs = [job, ...this.jobs]
    this.emit()
    return job
  }
  async cancel(id: string) {
    this.set(id, { status: 'canceled' })
  }
  async retry(id: string) {
    const j = this.jobs.find((x) => x.id === id)
    return j ? this.enqueue(j) : null
  }
  set(id: string, patch: Partial<Job>) {
    this.jobs = this.jobs.map((j) => (j.id === id ? { ...j, ...patch } : j))
    this.emit()
  }
  finish(id: string, urls: string[]) {
    this.set(id, { status: 'done', media: urls.map((url) => ({ url, mediaType: null, thumbnailUrl: null })) })
  }
  byCommand(part: string) {
    return this.jobs.find((j) => j.command.includes(`/slot1:${part}`))!
  }
}

const settle = () => new Promise((r) => setTimeout(r, 15))
const params = { name: 'Bob', imageUrl: 'https://img.example/head.png' }

async function setup() {
  const jobs = new FakeJobs()
  const store = memoryStore()
  const c = new RigBuildController(jobs, store, () => 1000)
  await c.ready()
  return { jobs, store, c }
}

describe('RigBuildController', () => {
  it('starts four part renders in order, with the head as the input image', async () => {
    const { jobs, c } = await setup()
    const b = await c.start(params)
    expect(b.phase).toBe('running')
    const queued = [...jobs.jobs].reverse() // oldest first = the order the engine runs them
    expect(queued.map((j) => j.command)).toEqual(PARTS.map((p) => partCommand(DEFAULT_PARTS_SLUG, p, 2102)))
    for (const j of queued) {
      expect(j.source?.initImageUrl).toBe(params.imageUrl)
      expect(j.workflowSlug).toBe(DEFAULT_PARTS_SLUG)
    }
    expect(Object.keys(b.steps)).toEqual(['mouth', 'idle', 'eyes', 'brows', 'pack'])
  })

  it('only the render that is actually running shows as running; the rest wait their turn', async () => {
    const { jobs, c } = await setup()
    await c.start(params)
    await settle()
    expect(PARTS.map((p) => c.get()!.steps[p].status)).toEqual(['waiting', 'waiting', 'waiting', 'waiting'])
    jobs.set(jobs.byCommand('mouth').id, { status: 'running' })
    await settle()
    expect(c.get()!.steps.mouth.status).toBe('running')
    expect(c.get()!.steps.idle.status).toBe('waiting')
  })

  it('waits for all four sheets, then packs them in order as placeholders', async () => {
    const { jobs, c } = await setup()
    await c.start(params)
    jobs.finish(jobs.byCommand('mouth').id, ['https://s/mouth.png'])
    jobs.finish(jobs.byCommand('idle').id, ['https://s/idle.png'])
    jobs.finish(jobs.byCommand('eyes').id, ['https://s/eyes.png'])
    await settle()
    expect(jobs.jobs.some((j) => j.command.includes('/run:rig-puppet-pack'))).toBe(false)

    jobs.finish(jobs.byCommand('brows').id, ['https://s/brows.png'])
    await settle()
    const pack = jobs.jobs.find((j) => j.workflowSlug === DEFAULT_PACK_SLUG)!
    expect(pack.command).toBe(packCommand(DEFAULT_PACK_SLUG))
    expect(pack.source?.placeholders).toEqual({
      URL1: 'https://s/mouth.png',
      URL2: 'https://s/idle.png',
      URL3: 'https://s/eyes.png',
      URL4: 'https://s/brows.png',
    })
    expect(pack.output).toEqual({ carrier: 'm3ds', expect: 'rig2d' })
    expect(c.get()?.phase).toBe('running')

    jobs.finish(pack.id, ['https://s/puppet.png'])
    await settle()
    expect(c.get()?.phase).toBe('done')
    expect(c.get()?.packMedia?.[0].url).toBe('https://s/puppet.png')
  })

  it('fails the build when a render fails, and cancels the sheets still waiting', async () => {
    const { jobs, c } = await setup()
    await c.start(params)
    jobs.set(jobs.byCommand('mouth').id, { status: 'failed', error: 'boom' })
    await settle()
    expect(c.get()?.phase).toBe('failed')
    expect(c.get()?.error).toBe('boom')
    expect(jobs.byCommand('idle').status).toBe('canceled')
    expect(jobs.byCommand('brows').status).toBe('canceled')
  })

  it('retries the failed step with a fresh job and carries on', async () => {
    const { jobs, c } = await setup()
    await c.start(params)
    jobs.finish(jobs.byCommand('mouth').id, ['https://s/mouth.png'])
    jobs.set(jobs.byCommand('idle').id, { status: 'failed', error: 'timeout' })
    await settle()
    expect(c.get()?.phase).toBe('failed')

    const oldId = c.get()!.steps.idle.jobId
    await c.retry()
    expect(c.get()?.phase).toBe('running')
    expect(c.get()!.steps.idle.jobId).not.toBe(oldId)
    expect(c.get()!.steps.mouth.status).toBe('done') // finished work is kept
  })

  it('treats a sheet count other than one as a failure', async () => {
    const { jobs, c } = await setup()
    await c.start(params)
    jobs.finish(jobs.byCommand('mouth').id, ['https://s/a.png', 'https://s/b.png'])
    await settle()
    expect(c.get()?.phase).toBe('failed')
    expect(c.get()?.error).toMatch(/Expected one sheet/)
  })

  it('cancel stops everything unfinished, and dismiss clears a finished build', async () => {
    const { jobs, c } = await setup()
    await c.start(params)
    await c.cancel()
    expect(c.get()?.phase).toBe('canceled')
    expect(jobs.jobs.every((j) => j.status === 'canceled')).toBe(true)
    await c.dismiss()
    expect(c.get()).toBeNull()
  })

  it('allows one build at a time and validates its inputs', async () => {
    const { c } = await setup()
    await expect(c.start({ ...params, imageUrl: 'not a url' })).rejects.toThrow(BuildError)
    await expect(c.start({ ...params, partsSlug: 'bad slug; rm' })).rejects.toThrow(/not valid/)
    await expect(c.start({ ...params, seed: 1.5 })).rejects.toThrow(/seed/)
    await expect(c.start({ ...params, seed: -1 })).rejects.toThrow(/seed/)
    await c.start(params)
    await expect(c.start(params)).rejects.toThrow(/already/)
    await c.dismiss() // refused while running
    expect(c.get()?.phase).toBe('running')
  })

  it('carries on after a restart from the saved state', async () => {
    const jobs = new FakeJobs()
    const store = memoryStore()
    const first = new RigBuildController(jobs, store)
    await first.ready()
    await first.start(params)
    for (const p of PARTS) jobs.finish(jobs.byCommand(p).id, [`https://s/${p}.png`])
    // the app closes before the pack render is queued: a new controller reads the saved state
    const second = new RigBuildController(jobs, store)
    await second.ready()
    await settle()
    expect(jobs.jobs.some((j) => j.workflowSlug === DEFAULT_PACK_SLUG)).toBe(true)
    expect(second.get()?.name).toBe('Bob')
  })

  it('reset (a wipe) forgets the build', async () => {
    const { c } = await setup()
    await c.start(params)
    c.reset()
    expect(c.get()).toBeNull()
  })
})
