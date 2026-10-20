import { describe, expect, it } from 'vitest'
import { assemble, crc32, hasM3dsHeader, M3dsError, parseChunk, progress } from './codec'
import { FIXTURES } from './fixtures'

const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

describe('crc32', () => {
  it('matches the standard check value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })
})

describe('codec output written by the real Python encoder', () => {
  it('decodes a gzipped single-chunk container', async () => {
    const f = FIXTURES.gzip_text
    const rgb = b64(f.rgb)
    expect(hasM3dsHeader(rgb)).toBe(true)
    const out = await assemble([parseChunk(rgb)])
    expect(out.filename).toBe('notes.txt')
    expect(out.chunks).toBe(1)
    expect(out.data).toEqual(b64(f.data))
  })

  it('decodes an uncompressed container, and padding pixels do not matter', async () => {
    const f = FIXTURES.raw_glb
    const out = await assemble([parseChunk(b64(f.rgb))])
    expect(out.filename).toBe('mesh.glb')
    expect(out.data).toEqual(b64(f.data))
    expect(String.fromCharCode(...out.data.subarray(0, 4))).toBe('glTF')
  })

  it('assembles a two-chunk container in any order and reports progress', async () => {
    const f = FIXTURES.two_chunk
    const [c0, c1] = f.rgbs.map((r) => parseChunk(b64(r)))
    expect(progress([c1])).toEqual({ have: 1, need: 2 })
    await expect(assemble([c1])).rejects.toThrow(/1 of 2 chunks/)
    const out = await assemble([c1, c0, c1])
    expect(out.chunks).toBe(2)
    expect(out.data).toEqual(b64(f.data))
    expect(JSON.parse(new TextDecoder().decode(out.data)).title).toBe('score')
  })
})

describe('validation', () => {
  it('rejects non-M3DS buffers', () => {
    expect(() => parseChunk(new Uint8Array(100))).toThrow(M3dsError)
    expect(() => parseChunk(new Uint8Array(10))).toThrow(/too small/)
    expect(hasM3dsHeader(new Uint8Array(100))).toBe(false)
  })

  it('detects pixels altered after export (chunk CRC)', () => {
    const rgb = b64(FIXTURES.gzip_text.rgb)
    rgb[rgb.length - 40] ^= 0xff
    expect(() => parseChunk(rgb)).toThrow(/CRC mismatch/)
  })

  it('rejects an unknown container version and truncated payloads', () => {
    const rgb = b64(FIXTURES.raw_glb.rgb)
    const v2 = rgb.slice()
    v2[4] = 2
    expect(() => parseChunk(v2)).toThrow(/version/)
    expect(() => parseChunk(rgb.slice(0, 200))).toThrow(/truncated/)
  })

  it('refuses to mix chunks of different containers', async () => {
    const a = parseChunk(b64(FIXTURES.two_chunk.rgbs[0]))
    const other = parseChunk(b64(FIXTURES.gzip_text.rgb))
    expect(progress([a, other])).toEqual({ have: 1, need: 2 })
    await expect(assemble([a, other])).rejects.toThrow(/1 of 2/)
  })
})
