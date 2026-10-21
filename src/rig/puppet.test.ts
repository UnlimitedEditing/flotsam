import { describe, expect, it } from 'vitest'
import { parseDirection } from './direction'
import { LIMITS, parsePuppetBundle, PuppetError } from './puppet'

const enc = (o: unknown) => new TextEncoder().encode(JSON.stringify(o))
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

function puppet(over: Record<string, unknown> = {}) {
  return {
    format: 'rigstudio.puppet',
    version: 2,
    name: 'bob',
    size: [100, 100],
    base: 'base.png',
    parts: {
      mouth: {
        box: [10, 60, 50, 80],
        frames: { X: 'mouth_X.png', A: 'mouth_A.png', idle_warm: 'mouth_idle_warm.png' },
        rest: 'X',
        speech: ['A'],
        idle: ['idle_warm'],
      },
      eyes: {
        box: [10, 20, 60, 40],
        frames: { open: 'eyes_open.png' },
        rest: 'open',
        pupils: { open: 'baked' },
      },
    },
    pupils: [],
    draw_order: ['eyes', 'pupils', 'mouth'],
    files: {
      'base.png': PNG,
      'mouth_X.png': PNG,
      'mouth_A.png': PNG,
      'mouth_idle_warm.png': PNG,
      'eyes_open.png': PNG,
    },
    ...over,
  }
}

describe('parsePuppetBundle', () => {
  it('accepts a well-formed v2 puppet', () => {
    const b = parsePuppetBundle(enc(puppet()))
    expect(b.name).toBe('bob')
    expect(b.size).toEqual([100, 100])
    expect(Object.keys(b.parts)).toEqual(['mouth', 'eyes'])
    expect(b.draw_order).toEqual(['eyes', 'pupils', 'mouth'])
  })

  it('rejects what is not a puppet, or not a part-based one', () => {
    expect(() => parsePuppetBundle(new TextEncoder().encode('nope'))).toThrow(PuppetError)
    expect(() => parsePuppetBundle(enc({ ...puppet(), format: 'rigstudio.direction' }))).toThrow(
      /not a Rig Studio puppet/,
    )
    expect(() => parsePuppetBundle(enc({ ...puppet(), version: 1 }))).toThrow(/version 2/)
    expect(() => parsePuppetBundle(enc([]))).toThrow(PuppetError)
  })

  it('rejects bad sizes, boxes and references', () => {
    expect(() => parsePuppetBundle(enc(puppet({ size: [0, 100] })))).toThrow(/size/)
    expect(() => parsePuppetBundle(enc(puppet({ size: [LIMITS.dimension + 1, 100] })))).toThrow(/size/)
    expect(() => parsePuppetBundle(enc(puppet({ size: [100.5, 100] })))).toThrow(/size/)
    const outside = puppet()
    outside.parts.mouth.box = [10, 60, 500, 80]
    expect(() => parsePuppetBundle(enc(outside))).toThrow(/outside/)
    const dangling = puppet()
    dangling.parts.mouth.frames.A = 'missing.png'
    expect(() => parsePuppetBundle(enc(dangling))).toThrow(/not in the file/)
    expect(() => parsePuppetBundle(enc(puppet({ base: 'nope.png' })))).toThrow(/not in the file/)
  })

  it('only accepts PNG layers with safe names', () => {
    const notPng = puppet()
    notPng.files['base.png'] = 'PHN2Zz48L3N2Zz4='
    expect(() => parsePuppetBundle(enc(notPng))).toThrow(/not a PNG/)
    const evilName = puppet()
    ;(evilName.files as Record<string, string>)['../../etc/passwd'] = PNG
    expect(() => parsePuppetBundle(enc(evilName))).toThrow(/unsafe name/)
    const tooMany = puppet()
    for (let i = 0; i < LIMITS.files + 1; i++) (tooMany.files as Record<string, string>)[`f${i}.png`] = PNG
    expect(() => parsePuppetBundle(enc(tooMany))).toThrow(/unusual number/)
  })

  it('needs a mouth and eyes, and ignores unknown parts in the draw order', () => {
    const noEyes = puppet()
    delete (noEyes.parts as Record<string, unknown>).eyes
    expect(() => parsePuppetBundle(enc(noEyes))).toThrow(/mouth and eyes/)
    const b = parsePuppetBundle(enc(puppet({ draw_order: ['eyes', 'ghost', 'mouth', 7] })))
    expect(b.draw_order).toEqual(['eyes', 'mouth'])
  })

  it('is not fooled by prototype keys', () => {
    const raw =
      '{"format":"rigstudio.puppet","version":2,"size":[10,10],"base":"constructor","files":{"base.png":"' +
      PNG +
      '"},"parts":{}}'
    expect(() => parsePuppetBundle(new TextEncoder().encode(raw))).toThrow(PuppetError)
  })
})

describe('parseDirection', () => {
  const sheet = (over: Record<string, unknown> = {}) => ({
    format: 'rigstudio.direction',
    version: 1,
    brief: 'warm and wry',
    audio: { duration: 188.2 },
    sentences: [
      { i: 0, t0: 0, t1: 2.5, text: 'Hello there.', delivery: 'warm', intensity: 'clear', locked: false },
      { i: 1, t0: 2.5, t1: 4, text: 'Really?', delivery: 'neutral', intensity: null, locked: true },
    ],
    ...over,
  })

  it('reads lines, duration and brief', () => {
    const d = parseDirection(enc(sheet()))
    expect(d.sentences).toHaveLength(2)
    expect(d.sentences[0]).toMatchObject({
      text: 'Hello there.',
      delivery: 'warm',
      intensity: 'clear',
      locked: false,
    })
    expect(d.sentences[1].locked).toBe(true)
    expect(d.duration).toBeCloseTo(188.2)
    expect(d.brief).toBe('warm and wry')
  })

  it('rejects other files and malformed input, and tolerates odd fields', () => {
    expect(() => parseDirection(enc({ format: 'rigstudio.puppet' }))).toThrow(/not a direction sheet/)
    expect(() => parseDirection(new TextEncoder().encode('{'))).toThrow(/not a readable/)
    expect(() => parseDirection(enc(sheet({ sentences: 'x' })))).toThrow(/no lines/)
    const d = parseDirection(enc(sheet({ sentences: [null, 5, { text: 'ok', delivery: 3 }], audio: null })))
    expect(d.sentences).toHaveLength(1)
    expect(d.sentences[0].delivery).toBe('neutral')
    expect(d.duration).toBeNull()
  })
})
