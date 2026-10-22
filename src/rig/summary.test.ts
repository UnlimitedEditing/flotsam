import { describe, expect, it } from 'vitest'
import { baseName, SummaryError, summariseSet, summariseShot, summariseTrack } from './summary'

const enc = (o: unknown) => new TextEncoder().encode(JSON.stringify(o))

describe('summariseTrack', () => {
  const track = {
    format: 'rigstudio.expression_track',
    version: 0,
    fps: 30,
    frames: 4,
    duration: 0.13,
    role: 'speaker',
    source: { audio: 'C:\\clips\\clip.wav' },
    layers: {
      idle: { blend: 'add', weight: 1, curves: { eyeBlink_L: [0, 1, 0, 0], browInnerUp: [0, 0.2, 0.1, 0] } },
      reflex: { blend: 'add', curves: { headPitch: [0, 0, 0, 0], jawOpen: [0.5, 'x', null, -0.7] } },
    },
    visemes: [{ t: 0, shape: 'X' }],
    events: [],
  }

  it('reads the headline facts and the most active channels', () => {
    const s = summariseTrack(enc(track))
    expect(s).toMatchObject({
      duration: 0.13,
      fps: 30,
      frames: 4,
      role: 'speaker',
      source: 'clip.wav',
      visemes: 1,
      events: 0,
    })
    expect(s.layers).toEqual([
      { name: 'idle', blend: 'add', channels: 2 },
      { name: 'reflex', blend: 'add', channels: 2 },
    ])
    expect(s.active[0]).toEqual(['eyeBlink_L', 1]) // the largest peak first
    expect(s.active.map((a) => a[0])).not.toContain('headPitch') // a flat channel is not "active"
  })

  it('survives odd values without throwing', () => {
    const s = summariseTrack(
      enc({ format: 'rigstudio.expression_track', layers: { a: 5, b: { curves: { c: 'no' } } } }),
    )
    expect(s.layers).toEqual([{ name: 'b', blend: undefined, channels: 1 }])
  })
})

describe('summariseSet', () => {
  it('reads size, props and faces, and previews the back wall only when it is a PNG', () => {
    const png = 'iVBORw0KGgoAAAANSUhEUg=='
    const set = {
      format: 'rigstudio.set',
      name: 'kitchen',
      size: [1280, 704],
      fov: 40,
      props: [{}, {}, {}],
      faces: {
        back: { file: 'back.png', size: [428, 266] },
        floor: { file: 'floor.png', size: [1298, 1966] },
      },
      clean: { file: 'clean.png' },
      files: { 'back.png': png, 'floor.png': 'not a png' },
    }
    const s = summariseSet(enc(set))
    expect(s).toMatchObject({ name: 'kitchen', size: [1280, 704], fov: 40, props: 3, hasCleanPlate: true })
    expect(s.faces).toHaveLength(2)
    expect(s.preview).toBe(`data:image/png;base64,${png}`)
    expect(summariseSet(enc({ ...set, files: { 'back.png': 'PHNjcmlwdD4=' } })).preview).toBeUndefined()
    expect(summariseSet(enc({ ...set, files: {} })).preview).toBeUndefined()
  })
})

describe('summariseShot', () => {
  it('counts actors, keys, moves and spoken lines', () => {
    const s = summariseShot(
      enc({
        format: 'rigstudio.shot',
        name: 'intro',
        duration: 17,
        set: '/samples/sets/kitchen_turbo.set.png',
        camera: [{}, {}, {}],
        lamp: [{}],
        actors: [
          { id: 'bob', kind: 'puppet', keys: [{}, {}], moves: [{}], lines: [{}, {}] },
          { id: 'left chair', kind: 'prop', keys: [{}] },
          'junk',
        ],
      }),
    )
    expect(s).toMatchObject({
      name: 'intro',
      duration: 17,
      set: 'kitchen_turbo.set.png',
      cameraKeys: 3,
      lampKeys: 1,
      spokenLines: 2,
    })
    expect(s.actors).toEqual([
      { id: 'bob', kind: 'puppet', keys: 2, moves: 1, lines: 2 },
      { id: 'left chair', kind: 'prop', keys: 1, moves: 0, lines: 0 },
    ])
  })
})

describe('hostile and wrong input', () => {
  it('refuses the wrong format, bad JSON and huge files with a plain message', () => {
    expect(() => summariseTrack(enc({ format: 'rigstudio.set' }))).toThrow(SummaryError)
    expect(() => summariseSet(new TextEncoder().encode('{not json'))).toThrow('not a readable set')
    expect(() => summariseShot(enc([1, 2]))).toThrow('not a Rig Studio shot')
    expect(() => summariseShot({ length: 65 * 1024 * 1024 } as unknown as Uint8Array)).toThrow('too large')
  })

  it('shortens names and never fetches them', () => {
    expect(baseName('https://x.example/a/b/c.set.png')).toBe('c.set.png')
    expect(baseName(undefined)).toBe('')
    expect(baseName('x'.repeat(500)).length).toBe(80)
  })
})
