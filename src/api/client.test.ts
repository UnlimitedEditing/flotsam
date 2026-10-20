import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('localStorage', { getItem: () => 'k', setItem() {}, removeItem() {} })

describe('fetchWorkflows', () => {
  it('flattens JSON:API items', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ data: [{ id: '1', attributes: { slug: 's', name: 'N' } }] }),
      })),
    )
    const { fetchWorkflows } = await import('./client')
    const w = await fetchWorkflows()
    expect(w[0]).toMatchObject({ id: '1', slug: 's', name: 'N' })
  })
})
