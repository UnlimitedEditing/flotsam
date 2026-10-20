import { afterEach, describe, expect, it, vi } from 'vitest'
import worker from './index'

const env = { ALLOWED_ORIGINS: 'https://app.example' }
const call = (path: string, init: RequestInit & { origin?: string | null } = {}) => {
  const { origin = 'https://app.example', ...rest } = init
  const headers = new Headers(rest.headers)
  if (origin) headers.set('origin', origin)
  return worker.fetch(new Request(`https://proxy.test${path}`, { ...rest, headers }), env)
}

afterEach(() => vi.unstubAllGlobals())

describe('flotsam proxy', () => {
  it('answers preflight for an allowed origin', async () => {
    const res = await call('/api/v3/workflows/', { method: 'OPTIONS' })
    expect(res.status).toBe(204)
    expect(res.headers.get('access-control-allow-origin')).toBe('https://app.example')
    expect(res.headers.get('access-control-allow-headers')).toContain('authorization')
  })

  it('refuses unknown origins and requests with no origin', async () => {
    expect((await call('/api/v3/workflows/', { origin: 'https://evil.example' })).status).toBe(403)
    expect((await call('/api/v3/workflows/', { origin: null })).status).toBe(403)
  })

  it('is not an open proxy: only /api/v3/ and GET/POST', async () => {
    const auth = { authorization: 'Bearer k' }
    expect((await call('/other', { headers: auth })).status).toBe(404)
    expect((await call('/api/v3/x', { method: 'DELETE', headers: auth })).status).toBe(405)
  })

  it('requires an Authorization header', async () => {
    expect((await call('/api/v3/workflows/')).status).toBe(401)
  })

  it('rejects oversized bodies', async () => {
    const res = await call('/api/v3/render/', {
      method: 'POST',
      headers: { authorization: 'Bearer k', 'content-length': '5000000' },
      body: 'x',
    })
    expect(res.status).toBe(413)
  })

  it('forwards only allowed headers upstream and adds CORS to the response', async () => {
    const upstream = vi.fn(
      async () =>
        new Response('{"data":[]}', {
          headers: { 'content-type': 'application/vnd.api+json', 'set-cookie': 'a=b' },
        }),
    )
    vi.stubGlobal('fetch', upstream)
    const res = await call('/api/v3/workflows/?x=1', {
      headers: { authorization: 'Bearer k', cookie: 'secret=1', 'x-other': '1' },
    })
    const [target, init] = upstream.mock.calls[0] as unknown as [string, RequestInit]
    expect(target).toBe('https://app.graydient.ai/api/v3/workflows/?x=1')
    const sent = new Headers(init.headers)
    expect(sent.get('authorization')).toBe('Bearer k')
    expect(sent.get('cookie')).toBeNull()
    expect(sent.get('x-other')).toBeNull()
    expect(res.headers.get('access-control-allow-origin')).toBe('https://app.example')
    expect(res.headers.get('set-cookie')).toBeNull()
    expect(res.headers.get('content-type')).toContain('json')
  })

  it('streams SSE bodies through incrementally', async () => {
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(new TextEncoder().encode('data: one\n\n'))
        c.enqueue(new TextEncoder().encode('data: two\n\n'))
        c.close()
      },
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(stream, { headers: { 'content-type': 'text/event-stream' } })),
    )
    const res = await call('/api/v3/render/', {
      method: 'POST',
      headers: { authorization: 'Bearer k' },
      body: '{}',
    })
    expect(await res.text()).toBe('data: one\n\ndata: two\n\n')
  })

  it('maps upstream network failure to 502 with CORS headers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('down')
      }),
    )
    const res = await call('/api/v3/workflows/', { headers: { authorization: 'Bearer k' } })
    expect(res.status).toBe(502)
    expect(res.headers.get('access-control-allow-origin')).toBe('https://app.example')
  })
})
