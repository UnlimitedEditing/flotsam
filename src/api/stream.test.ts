import { describe, expect, it } from 'vitest'
import { createLineBuffer, parseStreamLine } from './stream'

describe('parseStreamLine', () => {
  it('parses {event,data} and normalises aliases', () => {
    expect(parseStreamLine('data: {"event":"done","data":{"render_hash":"abc"}}')).toEqual({
      name: 'rendering_done',
      data: { render_hash: 'abc' },
    })
    expect(parseStreamLine('{"event":"started"}')).toEqual({ name: 'rendering_started', data: {} })
  })

  it('parses the wrapped shape', () => {
    expect(
      parseStreamLine('data: {"render_queued":{"render_hash":"h1","estimated_render_time":30}}'),
    ).toEqual({
      name: 'render_queued',
      data: { render_hash: 'h1', estimated_render_time: 30 },
    })
    expect(parseStreamLine('{"rendering_error":{"message":"boom"}}')?.name).toBe('rendering_error')
  })

  it('falls back to the first key for unknown wrapped events', () => {
    expect(parseStreamLine('{"progress":{"pct":5}}')).toEqual({ name: 'progress', data: {} })
  })

  it('ignores blanks, [DONE] and junk', () => {
    expect(parseStreamLine('')).toBeNull()
    expect(parseStreamLine('data: [DONE]')).toBeNull()
    expect(parseStreamLine('not json')).toBeNull()
    expect(parseStreamLine('123')).toBeNull()
  })
})

describe('createLineBuffer', () => {
  it('reassembles lines split across chunks', () => {
    const feed = createLineBuffer()
    expect(feed('data: {"a"')).toEqual([])
    expect(feed(':1}\ndata: {"b":2}\nda')).toEqual(['data: {"a":1}', 'data: {"b":2}'])
    expect(feed('ta: x\n')).toEqual(['data: x'])
  })
})
