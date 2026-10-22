import { describe, expect, it } from 'vitest'
import { identifyPayload, PAYLOAD_LABEL } from '../m3ds/registry'
import { hasViewer, viewerFor } from './registry'
import { infoFor, KINDS, VIEWER_INFO } from './viewerTable'

describe('viewer table and registry', () => {
  it('has unique kinds and unique formats', () => {
    expect(new Set(KINDS).size).toBe(KINDS.length)
    const formats = VIEWER_INFO.flatMap((v) => v.formats ?? [])
    expect(new Set(formats).size).toBe(formats.length)
  })

  it('identifies a kind from every format listed in the table', () => {
    for (const v of VIEWER_INFO)
      for (const f of v.formats ?? [])
        expect(identifyPayload('x.bin', new TextEncoder().encode(`{"format": "${f}"}`))).toBe(v.kind)
  })

  it('gives every kind a label, and unknown kinds the unknown label', () => {
    for (const k of KINDS) expect(PAYLOAD_LABEL[k].open.length).toBeGreaterThan(0)
    expect(infoFor('no-such-kind').kind).toBe('unknown')
    expect(PAYLOAD_LABEL['no-such-kind'].open).toBe('Open result')
  })

  it('falls back to the file-info viewer for a kind with no viewer, and reuses components', () => {
    expect(hasViewer('puppet')).toBe(true)
    expect(hasViewer('set')).toBe(false)
    expect(hasViewer('__proto__')).toBe(false)
    expect(viewerFor('set')).toBe(viewerFor('shot'))
    expect(viewerFor('puppet')).toBe(viewerFor('puppet'))
    expect(viewerFor('text')).toBe(viewerFor('track'))
    expect(viewerFor('score')).not.toBe(viewerFor('text')) // the score has its own player
  })
})
