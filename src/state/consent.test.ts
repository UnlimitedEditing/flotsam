import { describe, expect, it } from 'vitest'
import { TERMS, TERMS_VERSION } from '../legal/terms'
import { JobEngine, type RenderApi } from '../jobs/engine'
import { memoryStore } from '../jobs/store'
import { hasValidConsent } from './consent'

describe('hasValidConsent', () => {
  const ok = { version: TERMS_VERSION, acceptedAt: 1, over18: true }
  it('accepts only a current-version, over-18 consent', () => {
    expect(hasValidConsent(ok, TERMS_VERSION)).toBe(true)
    expect(hasValidConsent(null, TERMS_VERSION)).toBe(false)
    expect(hasValidConsent(undefined, TERMS_VERSION)).toBe(false)
    expect(hasValidConsent({ ...ok, over18: false }, TERMS_VERSION)).toBe(false)
  })
  it('asks again when the terms version changes', () => {
    expect(hasValidConsent({ ...ok, version: '2020-01-01.1' }, TERMS_VERSION)).toBe(false)
    expect(hasValidConsent(ok, '2099-01-01.1')).toBe(false)
  })
})

describe('terms text', () => {
  it('is versioned and states the essentials', () => {
    expect(TERMS_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/)
    const text = TERMS.map((s) => s.title + ' ' + s.body.join(' '))
      .join(' ')
      .toLowerCase()
    for (const must of [
      '18',
      'not made',
      'content policy',
      'your device',
      'warranty',
      'catbox',
      'modeltrends',
    ]) {
      expect(text).toContain(must)
    }
  })
})

describe('job engine waits for the gate', () => {
  it('does not send a queued job until the gate opens, then sends it', async () => {
    const submit = async () => ({
      renderHash: 'h',
      estimatedRenderTime: null,
      estimatedWaitTime: null,
      images: [{ url: 'https://x/a.png' }],
    })
    const api = {
      submitRender: submit,
      waitForRenderEvent: async () => null,
      pollRenderMedia: async () => [],
      cancelRender: async () => {},
      resolveAllMedia: (i: Array<{ url?: string }> | undefined) =>
        (i ?? []).flatMap((x) => (x.url ? [{ url: x.url, mediaType: null, thumbnailUrl: null }] : [])),
    } as unknown as RenderApi
    const e = new JobEngine(api, memoryStore())
    let open = false
    e.setGate(() => open)
    await e.ready()
    await e.enqueue({ workflowSlug: 'w', workflowName: 'W', prompt: 'p', command: '/workflow /run:w p' })
    await new Promise((r) => setTimeout(r, 20))
    expect(e.getJobs()[0].status).toBe('queued')
    open = true
    e.resume()
    for (let i = 0; i < 50 && e.getJobs()[0].status !== 'done'; i++)
      await new Promise((r) => setTimeout(r, 5))
    expect(e.getJobs()[0].status).toBe('done')
  })
})
