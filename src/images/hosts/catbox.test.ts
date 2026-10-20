import { afterEach, describe, expect, it, vi } from 'vitest'
import { catboxHost } from './catbox'

afterEach(() => vi.unstubAllGlobals())
const blob = () => new Blob(['x'], { type: 'image/jpeg' })
const ok = (url: string) => vi.fn(async (_u: string, _i: RequestInit) => new Response(url))

describe('catboxHost', () => {
  it('posts a multipart upload and returns the file URL', async () => {
    const f = ok('https://files.catbox.moe/abc.jpg')
    vi.stubGlobal('fetch', f)
    const url = await catboxHost({ userhash: ' hash123 ', endpoint: '/catbox' }).upload(blob(), 'photo.heic')
    expect(url).toBe('https://files.catbox.moe/abc.jpg')
    const form = f.mock.calls[0][1].body as FormData
    expect(form.get('reqtype')).toBe('fileupload')
    expect(form.get('userhash')).toBe('hash123')
    expect((form.get('fileToUpload') as File).name).toBe('photo.jpg') // extension follows the real type
  })

  it('omits the userhash for anonymous uploads', async () => {
    const f = ok('https://files.catbox.moe/x.png')
    vi.stubGlobal('fetch', f)
    await catboxHost({ endpoint: '/catbox' }).upload(new Blob(['x'], { type: 'image/png' }), 'a.png')
    expect((f.mock.calls[0][1].body as FormData).has('userhash')).toBe(false)
  })

  it('sends the Graydient key only when going through the relay', async () => {
    const f = ok('https://files.catbox.moe/x.jpg')
    vi.stubGlobal('fetch', f)
    await catboxHost({ endpoint: 'https://w.example/upload/catbox', apiKey: 'K' }).upload(blob(), 'a.jpg')
    expect(f.mock.calls[0][1].headers).toEqual({ Authorization: 'Bearer K' })
    await catboxHost({ endpoint: '/catbox', apiKey: 'K' }).upload(blob(), 'a.jpg')
    expect(f.mock.calls[1][1].headers).toBeUndefined()
    await catboxHost({ endpoint: 'https://catbox.moe/user/api.php', apiKey: 'K' }).upload(blob(), 'a.jpg')
    expect(f.mock.calls[2][1].headers).toBeUndefined()
  })

  it('turns errors and odd responses into readable failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('No userhash match', { status: 412 })),
    )
    await expect(catboxHost({ endpoint: '/catbox' }).upload(blob(), 'a.jpg')).rejects.toThrow(
      /Upload failed \(412\)/,
    )
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('<html>nope</html>', { status: 200 })),
    )
    await expect(catboxHost({ endpoint: '/catbox' }).upload(blob(), 'a.jpg')).rejects.toThrow(/Upload failed/)
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('Failed to fetch')
      }),
    )
    await expect(catboxHost({ endpoint: '/catbox' }).upload(blob(), 'a.jpg')).rejects.toThrow(
      /Could not reach/,
    )
  })
})
