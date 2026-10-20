import { describe, expect, it, vi } from 'vitest'
import { assertFetchableUrl, resolveImage } from './resolve'
import { InvalidImageUrlError, NeedsImageHostError, type ImageHost } from './types'

const file = { kind: 'file', blob: new Blob(['x']), name: 'a.png' } as const

describe('resolveImage', () => {
  it('passes render and pasted URLs through', async () => {
    const u = 'https://piratediffusion1.s3.amazonaws.com/renders2/abc/x.png'
    expect(await resolveImage({ kind: 'render', url: u })).toBe(u)
    expect(await resolveImage({ kind: 'url', url: `  ${u} ` })).toBe(u)
  })

  it('refuses local files when no host is configured', async () => {
    await expect(resolveImage(file)).rejects.toBeInstanceOf(NeedsImageHostError)
  })

  it('uploads files through the chosen host', async () => {
    const host: ImageHost = { id: 'h', label: 'H', upload: vi.fn(async () => 'https://h.example/x.png') }
    expect(await resolveImage(file, host)).toBe('https://h.example/x.png')
    expect(host.upload).toHaveBeenCalledWith(file.blob, 'a.png', undefined)
  })

  it('rejects a host that returns something unusable', async () => {
    const host: ImageHost = { id: 'h', label: 'H', upload: async () => 'not a url' }
    await expect(resolveImage(file, host)).rejects.toBeInstanceOf(InvalidImageUrlError)
  })
})

describe('assertFetchableUrl', () => {
  it('rejects non-http and percent-encoded URLs', () => {
    expect(() => assertFetchableUrl('ftp://x/y.png')).toThrow(InvalidImageUrlError)
    expect(() => assertFetchableUrl('https%3A%2F%2Fx%2Fy.png')).toThrow(InvalidImageUrlError)
    expect(() => assertFetchableUrl('https://x/a%2Fb.png')).toThrow(InvalidImageUrlError)
  })
})
