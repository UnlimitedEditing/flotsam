import { afterEach, describe, expect, it, vi } from 'vitest'

vi.stubGlobal('localStorage', { getItem: () => 'k', setItem() {}, removeItem() {} })

const json = (body: unknown) => ({ ok: true, json: async () => body })
const sse = (lines: string[]) =>
  new Response(
    new ReadableStream({
      start: (c) => (lines.forEach((l) => c.enqueue(new TextEncoder().encode(l + '\n'))), c.close()),
    }),
  )

afterEach(() => vi.unstubAllGlobals())

describe('fetchWorkflows', () => {
  it('flattens JSON:API items', async () => {
    vi.stubGlobal('localStorage', { getItem: () => 'k', setItem() {}, removeItem() {} })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ data: [{ id: '1', attributes: { slug: 's', name: 'N' } }] })),
    )
    const { fetchWorkflows } = await import('./client')
    expect((await fetchWorkflows())[0]).toMatchObject({ id: '1', slug: 's', name: 'N' })
  })

  it('follows links.next across pages and dedupes', async () => {
    vi.stubGlobal('localStorage', { getItem: () => 'k', setItem() {}, removeItem() {} })
    const pages: Record<string, unknown> = {
      'workflows/': {
        data: [{ id: '1', attributes: { slug: 'a' } }],
        links: { next: 'https://app.graydient.ai/api/v3/workflows/?page=2' },
      },
      'workflows/?page=2': {
        data: [
          { id: '1', attributes: { slug: 'a' } },
          { id: '2', attributes: { slug: 'b' } },
        ],
        links: { next: null },
      },
    }
    const f = vi.fn(async (url: string) =>
      json(pages[url.replace(/^\/gd\/|^https:\/\/app\.graydient\.ai\/api\/v3\//, '')]),
    )
    vi.stubGlobal('fetch', f)
    const { fetchWorkflows } = await import('./client')
    const all = await fetchWorkflows()
    expect(all.map((w) => w.id)).toEqual(['1', '2'])
    expect(f).toHaveBeenCalledTimes(2)
  })
})

describe('nextToPath', () => {
  it('strips origin and api prefix', async () => {
    const { nextToPath } = await import('./client')
    expect(nextToPath('https://app.graydient.ai/api/v3/workflows/?page=3')).toBe('workflows/?page=3')
    expect(nextToPath('/api/v3/workflows/?page=3')).toBe('workflows/?page=3')
  })
})

describe('submitRender', () => {
  it('reads queued then done from the stream', async () => {
    vi.stubGlobal('localStorage', { getItem: () => 'k', setItem() {}, removeItem() {} })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        sse([
          'data: {"render_queued":{"render_hash":"h1","estimated_render_time":20}}',
          'data: {"rendering_started":{}}',
          'data: {"rendering_done":{"images":[{"url":"https://x/a.png"}]}}',
        ]),
      ),
    )
    const { submitRender } = await import('./client')
    const seen: string[] = []
    const r = await submitRender('/workflow /run:x hi', { onEvent: (e) => seen.push(e.name) })
    expect(r.renderHash).toBe('h1')
    expect(r.estimatedRenderTime).toBe(20)
    expect(r.images).toEqual([{ url: 'https://x/a.png' }])
    expect(seen).toEqual(['render_queued', 'rendering_started', 'rendering_done'])
  })

  it('throws on rendering_error', async () => {
    vi.stubGlobal('localStorage', { getItem: () => 'k', setItem() {}, removeItem() {} })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => sse(['{"rendering_error":{"message":"boom"}}'])),
    )
    const { submitRender } = await import('./client')
    await expect(submitRender('x')).rejects.toThrow('boom')
  })
})

describe('pollRenderMedia', () => {
  it('retries with backoff until media appears', async () => {
    vi.stubGlobal('localStorage', { getItem: () => 'k', setItem() {}, removeItem() {} })
    let n = 0
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ images: ++n < 3 ? [] : [{ url: 'https://x/b.png' }] })),
    )
    const { pollRenderMedia } = await import('./client')
    const delays: number[] = []
    const media = await pollRenderMedia('h', { sleep: async (ms) => void delays.push(ms) })
    expect(media).toEqual([{ url: 'https://x/b.png', mediaType: null, thumbnailUrl: null }])
    expect(delays).toEqual([1000, 2000])
  })

  it('gives up at the ceiling', async () => {
    vi.stubGlobal('localStorage', { getItem: () => 'k', setItem() {}, removeItem() {} })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => json({ images: [] })),
    )
    const { pollRenderMedia } = await import('./client')
    expect(await pollRenderMedia('h', { ceilingMs: 3000, sleep: async () => {} })).toEqual([])
  })
})
