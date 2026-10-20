import { describe, expect, it, vi } from 'vitest'
import { JobEngine, type RenderApi } from './engine'
import { memoryStore } from './store'
import type { NewJob } from './types'

const input = (n: string): NewJob => ({
  workflowSlug: 'wf',
  workflowName: 'WF',
  prompt: n,
  command: `/workflow /run:wf ${n}`,
})

const media = (url: string) => [{ url, mediaType: null, thumbnailUrl: null }]

function fakeApi(over: Partial<RenderApi> = {}): RenderApi {
  return {
    submitRender: vi.fn(async (_p, o) => {
      o.onEvent?.({ name: 'render_queued', data: { render_hash: 'h', estimated_render_time: 30 } })
      return {
        renderHash: 'h',
        estimatedRenderTime: 30,
        estimatedWaitTime: 0,
        images: [{ url: 'https://x/a.png' }],
      }
    }),
    waitForRenderEvent: vi.fn(async () => null),
    pollRenderMedia: vi.fn(async () => []),
    cancelRender: vi.fn(async () => {}),
    resolveAllMedia: (imgs) => (imgs ?? []).flatMap((i) => (i.url ? media(i.url) : [])),
    ...over,
  }
}

const settle = () => new Promise((r) => setTimeout(r, 0))
async function until(cond: () => boolean) {
  for (let i = 0; i < 50 && !cond(); i++) await settle()
}

describe('JobEngine', () => {
  it('runs a job to done and records media and hash', async () => {
    const e = new JobEngine(fakeApi(), memoryStore())
    await e.ready()
    await e.enqueue(input('a'))
    await until(() => e.getJobs()[0]?.status === 'done')
    expect(e.getJobs()[0]).toMatchObject({ status: 'done', renderHash: 'h', media: media('https://x/a.png') })
  })

  it('runs one job at a time, oldest first', async () => {
    const order: string[] = []
    let active = 0
    let maxActive = 0
    const api = fakeApi({
      submitRender: vi.fn(async (p) => {
        active++
        maxActive = Math.max(maxActive, active)
        order.push(p)
        await settle()
        active--
        return {
          renderHash: p,
          estimatedRenderTime: null,
          estimatedWaitTime: null,
          images: [{ url: 'https://x/' + p }],
        }
      }),
    })
    const e = new JobEngine(api, memoryStore())
    await e.ready()
    await e.enqueue(input('one'))
    await e.enqueue(input('two'))
    await e.enqueue(input('three'))
    await until(() => e.getJobs().every((j) => j.status === 'done'))
    expect(maxActive).toBe(1)
    expect(order.map((c) => c.split(' ').pop())).toEqual(['one', 'two', 'three'])
  })

  it('falls back to the websocket, then to polling, when the stream has no images', async () => {
    const noImages = vi.fn(async () => ({
      renderHash: 'h',
      estimatedRenderTime: null,
      estimatedWaitTime: null,
      images: null,
    }))
    const ws = fakeApi({
      submitRender: noImages,
      waitForRenderEvent: vi.fn(async () => [{ url: 'https://x/ws.png' }]),
    })
    const e1 = new JobEngine(ws, memoryStore())
    await e1.ready()
    await e1.enqueue(input('a'))
    await until(() => e1.getJobs()[0]?.status === 'done')
    expect(e1.getJobs()[0].media[0].url).toBe('https://x/ws.png')
    expect(ws.pollRenderMedia).not.toHaveBeenCalled()

    const poll = fakeApi({
      submitRender: noImages,
      pollRenderMedia: vi.fn(async () => media('https://x/poll.png')),
    })
    const e2 = new JobEngine(poll, memoryStore())
    await e2.ready()
    await e2.enqueue(input('b'))
    await until(() => e2.getJobs()[0]?.status === 'done')
    expect(e2.getJobs()[0].media[0].url).toBe('https://x/poll.png')
  })

  it('marks a job failed when submit throws, and retry creates a fresh job', async () => {
    const submit = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue({
        renderHash: 'h2',
        estimatedRenderTime: null,
        estimatedWaitTime: null,
        images: [{ url: 'https://x/ok.png' }],
      })
    const e = new JobEngine(fakeApi({ submitRender: submit }), memoryStore())
    await e.ready()
    const j = await e.enqueue(input('a'))
    await until(() => e.getJobs()[0]?.status === 'failed')
    expect(e.getJobs()[0].error).toBe('boom')
    const retried = await e.retry(j.id)
    expect(retried?.id).not.toBe(j.id)
    await until(() => e.getJobs().some((x) => x.id === retried?.id && x.status === 'done'))
  })

  it('cancels a queued job without submitting it', async () => {
    let release!: () => void
    const gate = new Promise<void>((r) => (release = r))
    const api = fakeApi({
      submitRender: vi.fn(async () => {
        await gate
        return {
          renderHash: 'h',
          estimatedRenderTime: null,
          estimatedWaitTime: null,
          images: [{ url: 'https://x/a.png' }],
        }
      }),
    })
    const e = new JobEngine(api, memoryStore())
    await e.ready()
    await e.enqueue(input('first'))
    const second = await e.enqueue(input('second'))
    await e.cancel(second.id)
    release()
    await until(() => e.getJobs().find((j) => j.prompt === 'first')?.status === 'done')
    expect(e.getJobs().find((j) => j.id === second.id)?.status).toBe('canceled')
    expect(api.submitRender).toHaveBeenCalledTimes(1)
  })

  it('cancels the active job via abort and tells Graydient', async () => {
    const api = fakeApi({
      submitRender: vi.fn(async (_p, o) => {
        o.onEvent?.({ name: 'render_queued', data: { render_hash: 'live' } })
        await new Promise((_, rej) =>
          o.signal?.addEventListener('abort', () => rej(new DOMException('x', 'AbortError'))),
        )
        throw new Error('unreachable')
      }),
    })
    const e = new JobEngine(api, memoryStore())
    await e.ready()
    const j = await e.enqueue(input('a'))
    await until(() => e.getJobs()[0]?.renderHash === 'live')
    await e.cancel(j.id)
    await until(() => e.getJobs()[0]?.status === 'canceled')
    expect(api.cancelRender).toHaveBeenCalledWith('live')
  })

  it('restores history and fails jobs that were mid-flight when the app closed', async () => {
    const store = memoryStore()
    await store.write('jobs.v1', [
      { ...input('old'), id: '1', createdAt: 1, status: 'running', media: [] },
      { ...input('done'), id: '2', createdAt: 0, status: 'done', media: media('https://x/d.png') },
    ])
    const e = new JobEngine(fakeApi(), store)
    await e.ready()
    expect(e.getJobs().find((j) => j.id === '1')).toMatchObject({ status: 'failed' })
    expect(e.getJobs().find((j) => j.id === '2')?.status).toBe('done')
  })
})
