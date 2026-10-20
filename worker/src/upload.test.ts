import { afterEach, describe, expect, it, vi } from 'vitest'
import worker from './index'

const env = { ALLOWED_ORIGINS: 'https://app.example' }
const call = (init: RequestInit & { length?: string | null } = {}) => {
  const { length = '100', ...rest } = init
  const headers = new Headers(rest.headers)
  headers.set('origin', 'https://app.example')
  if (length !== null) headers.set('content-length', length)
  return worker.fetch(
    new Request('https://proxy.test/upload/catbox', { method: 'POST', ...rest, headers }),
    env,
  )
}
const multipart = { 'content-type': 'multipart/form-data; boundary=xyz', authorization: 'Bearer good' }

afterEach(() => vi.unstubAllGlobals())

describe('catbox relay', () => {
  it('requires a key, a length and a multipart body, and caps the size', async () => {
    expect((await call({ headers: { 'content-type': multipart['content-type'] }, body: 'x' })).status).toBe(
      401,
    )
    expect((await call({ headers: multipart, body: 'x', length: null })).status).toBe(411)
    expect((await call({ headers: multipart, body: 'x', length: '20000000' })).status).toBe(413)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{}', { status: 200 })),
    )
    expect((await call({ headers: { ...multipart, 'content-type': 'text/plain' }, body: 'x' })).status).toBe(
      415,
    )
  })

  it('rejects an invalid Graydient key without calling Catbox', async () => {
    const f = vi.fn(async (_url: string) => new Response('no', { status: 401 }))
    vi.stubGlobal('fetch', f)
    const res = await call({ headers: { ...multipart, authorization: 'Bearer bad' }, body: 'x' })
    expect(res.status).toBe(401)
    expect(f).toHaveBeenCalledTimes(1) // only the key check
    expect(String(f.mock.calls[0][0])).toContain('app.graydient.ai')
  })

  it('relays to Catbox without the Authorization header, adds CORS, and caches the key check', async () => {
    const f = vi.fn(async (url: string) =>
      String(url).includes('catbox.moe')
        ? new Response('https://files.catbox.moe/abc.png', { headers: { 'content-type': 'text/plain' } })
        : new Response('{}', { status: 200 }),
    )
    vi.stubGlobal('fetch', f)
    const own = { ...multipart, authorization: 'Bearer cache-test' }
    const res = await call({ headers: own, body: 'x' })
    expect(await res.text()).toBe('https://files.catbox.moe/abc.png')
    expect(res.headers.get('access-control-allow-origin')).toBe('https://app.example')
    const catboxCall = f.mock.calls.find((c) => String(c[0]).includes('catbox.moe')) as unknown as [
      string,
      RequestInit,
    ]
    expect(new Headers(catboxCall[1].headers).get('authorization')).toBeNull()
    expect(new Headers(catboxCall[1].headers).get('content-type')).toContain('multipart/form-data')

    await call({ headers: own, body: 'y' })
    expect(f.mock.calls.filter((c) => String(c[0]).includes('app.graydient.ai'))).toHaveLength(1)
  })

  it('rejects non-POST and unknown origins', async () => {
    expect((await call({ method: 'GET', headers: multipart })).status).toBe(405)
    const res = await worker.fetch(
      new Request('https://proxy.test/upload/catbox', {
        method: 'POST',
        headers: { origin: 'https://evil.example' },
      }),
      env,
    )
    expect(res.status).toBe(403)
  })
})
