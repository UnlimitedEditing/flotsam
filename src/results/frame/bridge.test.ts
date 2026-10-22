import { describe, expect, it } from 'vitest'
import { loadMessage, MAX_FRAME_BYTES, parseFrameMessage } from './bridge'

const win = {}
const ORIGIN = 'https://app.example'
const msg = (data: unknown, over: Partial<{ origin: string; source: unknown }> = {}) =>
  parseFrameMessage({ origin: ORIGIN, source: win, data, ...over }, win, ORIGIN)

describe('frame bridge', () => {
  it('accepts the messages a frame may send', () => {
    expect(msg({ type: 'hello' })).toEqual({ type: 'hello' })
    expect(msg({ type: 'loaded' })).toEqual({ type: 'loaded' })
    expect(msg({ type: 'error', message: 'nope' })).toEqual({ type: 'error', message: 'nope' })
    const bytes = new Uint8Array([1, 2, 3]).buffer
    expect(msg({ type: 'save', filename: 'a.json', bytes })).toEqual({
      type: 'save',
      filename: 'a.json',
      bytes,
    })
  })

  it('ignores a message from another window or origin', () => {
    expect(msg({ type: 'hello' }, { source: {} })).toBeNull()
    expect(msg({ type: 'hello' }, { origin: 'https://evil.example' })).toBeNull()
    expect(
      parseFrameMessage({ origin: ORIGIN, source: win, data: { type: 'hello' } }, null, ORIGIN),
    ).toBeNull()
  })

  it('ignores malformed and unknown messages', () => {
    for (const bad of [
      null,
      'hello',
      7,
      [],
      {},
      { type: 'unknown' },
      { type: 'error' },
      { type: 'error', message: 3 },
    ])
      expect(msg(bad)).toBeNull()
    expect(msg({ type: 'save', filename: '', bytes: new ArrayBuffer(4) })).toBeNull()
    expect(msg({ type: 'save', filename: 'a', bytes: new ArrayBuffer(0) })).toBeNull()
    expect(msg({ type: 'save', filename: 'a', bytes: 'not a buffer' })).toBeNull()
    expect(msg({ type: 'save', filename: 'x'.repeat(121), bytes: new ArrayBuffer(4) })).toBeNull()
    expect(msg({ type: 'save', filename: 'a', bytes: { byteLength: MAX_FRAME_BYTES + 1 } })).toBeNull()
  })

  it('caps the length of an error text', () => {
    const m = msg({ type: 'error', message: 'e'.repeat(5000) })
    expect(m && m.type === 'error' && m.message.length).toBe(300)
  })

  it('sends a copy of the file, leaving the original intact', () => {
    const data = new Uint8Array([9, 8, 7])
    const m = loadMessage('s.json', data)
    expect(m.type).toBe('load')
    expect(new Uint8Array(m.bytes)).toEqual(data)
    expect(m.bytes).not.toBe(data.buffer)
  })
})
