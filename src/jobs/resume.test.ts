import { describe, expect, it, vi } from 'vitest'
import { JobEngine, type RenderApi } from './engine'
import { memoryStore } from './store'

const media = (url: string) => [{ url, mediaType: null, thumbnailUrl: null }]

function api(over: Partial<RenderApi> = {}): RenderApi {
  return {
    submitRender: vi.fn(async () => ({
      renderHash: 'new',
      estimatedRenderTime: null,
      estimatedWaitTime: null,
      images: null,
    })),
    waitForRenderEvent: vi.fn(async () => null),
    pollRenderMedia: vi.fn(async () => media('https://x/resumed.png')),
    cancelRender: vi.fn(async () => {}),
    resolveAllMedia: (i) => (i ?? []).flatMap((x) => (x.url ? media(x.url) : [])),
    ...over,
  }
}

const job = (id: string, status: string, extra: object = {}) => ({
  id,
  createdAt: 1,
  workflowSlug: 'w',
  workflowName: 'W',
  prompt: 'p',
  command: '/workflow /run:w p',
  status,
  media: [],
  ...extra,
})

const until = async (cond: () => boolean) => {
  for (let i = 0; i < 100 && !cond(); i++) await new Promise((r) => setTimeout(r, 5))
}

describe('resuming renders after an app restart', () => {
  it('keeps waiting for a running render that has a hash, without submitting it again', async () => {
    const store = memoryStore()
    await store.write('jobs.v1', [job('a', 'running', { renderHash: 'H' })])
    const a = api()
    const e = new JobEngine(a, store)
    await e.ready()
    expect(e.getJobs()[0].status).toBe('running')
    await until(() => e.getJobs()[0].status === 'done')
    expect(e.getJobs()[0]).toMatchObject({ status: 'done', media: media('https://x/resumed.png') })
    expect(a.submitRender).not.toHaveBeenCalled()
    expect(a.waitForRenderEvent).toHaveBeenCalledWith('H', expect.any(Number), expect.anything())
  })

  it('still fails a job that was interrupted before Graydient accepted it (no hash)', async () => {
    const store = memoryStore()
    await store.write('jobs.v1', [job('b', 'submitting')])
    const e = new JobEngine(api(), store)
    await e.ready()
    expect(e.getJobs()[0].status).toBe('failed')
    expect(e.getJobs()[0].error).toMatch(/before the render was accepted/)
  })

  it('resumes before sending queued jobs and one at a time', async () => {
    const order: string[] = []
    const store = memoryStore()
    await store.write('jobs.v1', [
      job('q', 'queued', { createdAt: 5 }),
      job('r', 'running', { renderHash: 'H' }),
    ])
    const a = api({
      pollRenderMedia: vi.fn(async () => {
        order.push('resume')
        return media('https://x/r.png')
      }),
      submitRender: vi.fn(async () => {
        order.push('submit')
        return {
          renderHash: 'n',
          estimatedRenderTime: null,
          estimatedWaitTime: null,
          images: [{ url: 'https://x/q.png' }],
        }
      }),
    })
    const e = new JobEngine(a, store)
    await e.ready()
    await until(() => e.getJobs().every((j) => j.status === 'done'))
    expect(order).toEqual(['resume', 'submit'])
  })

  it('can cancel a resumed render', async () => {
    const store = memoryStore()
    await store.write('jobs.v1', [job('c', 'running', { renderHash: 'H' })])
    const a = api({
      waitForRenderEvent: vi.fn(
        (_h: string, _t: number, signal?: AbortSignal) =>
          new Promise<null>((resolve) => signal?.addEventListener('abort', () => resolve(null))),
      ),
    })
    const e = new JobEngine(a, store)
    await e.ready()
    await until(() => (a.waitForRenderEvent as ReturnType<typeof vi.fn>).mock.calls.length > 0)
    await e.cancel('c')
    await until(() => e.getJobs()[0].status === 'canceled')
    expect(a.cancelRender).toHaveBeenCalledWith('H')
  })
})
