import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchWorkflows, GateError, setConsentChecker, waitForRenderEvent } from './client'

// The setup file grants consent for other tests; these prove the deny path, which is the hard rule.
beforeEach(() => {
  vi.stubGlobal('localStorage', { getItem: () => 'k', setItem() {}, removeItem() {} })
})
afterEach(() => {
  vi.unstubAllGlobals()
  setConsentChecker(() => true)
})

describe('the age gate in the API client', () => {
  it('makes no network call and throws GateError until consent is given', async () => {
    const f = vi.fn(async () => new Response('{"data":[]}'))
    vi.stubGlobal('fetch', f)
    setConsentChecker(() => false)
    await expect(fetchWorkflows()).rejects.toBeInstanceOf(GateError)
    expect(f).not.toHaveBeenCalled()

    setConsentChecker(() => true)
    await fetchWorkflows()
    expect(f).toHaveBeenCalledTimes(1)
  })

  it('does not open the render WebSocket without consent', async () => {
    const ws = vi.fn()
    vi.stubGlobal('WebSocket', ws)
    setConsentChecker(() => false)
    expect(await waitForRenderEvent('h', 50)).toBeNull()
    expect(ws).not.toHaveBeenCalled()
  })

  it('is deny-by-default in the shipped module (nothing wired = nothing sent)', async () => {
    vi.resetModules()
    const fresh = await import('./client')
    const f = vi.fn(async () => new Response('{}'))
    vi.stubGlobal('fetch', f)
    await expect(fresh.get('workflows/')).rejects.toBeInstanceOf(fresh.GateError)
    expect(f).not.toHaveBeenCalled()
  })
})
