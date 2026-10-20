import { describe, expect, it, vi } from 'vitest'
import { memoryStore } from '../jobs/store'
import { createHeatClient, parseModelId, readHeat } from './modeltrends'

const doc = {
  name: 'pixelwave flux',
  heat: { score: 2551, scale_max: 9999, tier: 'hot', future_field: 1 },
  trend: { week: { pct: 12.5 } },
  standings: [
    { kind: 'overall', rank: 409, of: 6544 },
    { kind: 'family', rank: 56, of: 107 },
  ],
  links: { page: 'https://modeltrends.ai/ai-models/flux/pixelwave-flux-7d01a45e' },
  brand_new_section: { anything: true },
}
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })

describe('parseModelId', () => {
  it('reads the id from a page URL or a bare id', () => {
    expect(parseModelId('https://modeltrends.ai/ai-models/qwen2/qwen-image-asian-mix-lora-df7074ba')).toBe(
      'df7074ba',
    )
    expect(parseModelId(' https://modeltrends.ai/ai-models/llm/qwen3.6-35b-a3b-e81f3db1/?x=1#top ')).toBe(
      'e81f3db1',
    )
    expect(parseModelId('7D01A45E')).toBe('7d01a45e')
    expect(parseModelId('https://example.com/ai-models/x/y-df7074ba')).toBe('df7074ba')
    expect(parseModelId('not a link')).toBeNull()
    expect(parseModelId('https://modeltrends.ai/ai-models/rankings/top')).toBeNull()
  })
})

describe('readHeat', () => {
  it('extracts what we need and ignores unknown fields', () => {
    expect(readHeat('7d01a45e', doc)).toEqual({
      id: '7d01a45e',
      name: 'pixelwave flux',
      score: 2551,
      scaleMax: 9999,
      tier: 'hot',
      weekPct: 12.5,
      rank: { rank: 409, of: 6544 },
      pageUrl: 'https://modeltrends.ai/ai-models/flux/pixelwave-flux-7d01a45e',
    })
  })
  it('returns null without a score or page link (we may not show a number without its link)', () => {
    expect(readHeat('x', { heat: { score: 1 } })).toBeNull()
    expect(readHeat('x', { links: { page: 'https://x' } })).toBeNull()
    expect(readHeat('x', null)).toBeNull()
  })
})

describe('heat client caching', () => {
  it('fetches once per day per model', async () => {
    let t = 1_000
    const f = vi.fn(async (_u: string) => ok(doc))
    const c = createHeatClient({ fetch: f as unknown as typeof fetch, store: memoryStore(), now: () => t })
    expect((await c.get('7d01a45e'))?.score).toBe(2551)
    await c.get('7d01a45e')
    expect(f).toHaveBeenCalledTimes(1)
    expect(f.mock.calls[0][0]).toBe('https://modeltrends.ai/v1/model/7d01a45e.json')
    t += 25 * 60 * 60 * 1000
    await c.get('7d01a45e')
    expect(f).toHaveBeenCalledTimes(2)
  })

  it('remembers a 404 (unknown, no data, or adult) for a day instead of re-asking', async () => {
    const f = vi.fn(async (_u: string) => new Response('{}', { status: 404 }))
    const c = createHeatClient({ fetch: f as unknown as typeof fetch, store: memoryStore(), now: () => 1 })
    expect(await c.get('deadbeef')).toBeNull()
    expect(await c.get('deadbeef')).toBeNull()
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('keeps showing the stale score when the service errors, and retries next time', async () => {
    let t = 0
    const f = vi
      .fn<(u: string) => Promise<Response>>()
      .mockResolvedValueOnce(ok(doc))
      .mockResolvedValueOnce(new Response('oops', { status: 500 }))
      .mockResolvedValueOnce(ok(doc))
    const c = createHeatClient({ fetch: f as unknown as typeof fetch, store: memoryStore(), now: () => t })
    await c.get('7d01a45e')
    t += 25 * 60 * 60 * 1000
    expect((await c.get('7d01a45e'))?.score).toBe(2551) // stale copy during the outage
    expect((await c.get('7d01a45e'))?.score).toBe(2551)
    expect(f).toHaveBeenCalledTimes(3) // the failed refresh was not cached, so it retried
  })
})
