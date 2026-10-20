import { describe, expect, it } from 'vitest'
import { adultOne, meshFlow, mossTurbo } from '../lib/fixtures'
import { mismatchNote, outputSpec, viewerKind } from './registry'

describe('outputSpec', () => {
  it('defaults mesh-producing workflows to an M3DS 3D model and leaves image workflows alone', () => {
    expect(outputSpec(meshFlow)).toEqual({ carrier: 'm3ds', expect: 'model3d' })
    expect(outputSpec(mossTurbo)).toBeNull()
  })

  it('lets the user override either way, including turning M3DS off', () => {
    expect(outputSpec(mossTurbo, { 'moss-turbo': { carrier: 'm3ds', expect: 'text' } })).toEqual({
      carrier: 'm3ds',
      expect: 'text',
    })
    expect(outputSpec(meshFlow, { 'to-mesh': null })).toBeNull()
    expect(outputSpec(adultOne, {})).toBeNull()
  })
})

describe('viewerKind', () => {
  const bytes = (s: string) => new TextEncoder().encode(s)
  it('chooses by file name first, then by content, then by expectation', () => {
    expect(viewerKind('a.glb', bytes('x'), 'unknown')).toBe('model')
    expect(viewerKind('notes.TXT', bytes('x'), 'model3d')).toBe('text')
    expect(viewerKind('noext', bytes('glTF....'), 'unknown')).toBe('model')
    expect(viewerKind('noext', bytes('hello'), 'text')).toBe('text')
    expect(viewerKind('rig.bin', bytes('hello'), 'rig2d')).toBe('info')
  })

  it('warns when the file is not what the workflow was marked as', () => {
    expect(mismatchNote('model3d', 'text', 'a.txt')).toMatch(/3d model/)
    expect(mismatchNote('model3d', 'model', 'a.glb')).toBeNull()
    expect(mismatchNote('unknown', 'info', 'a.bin')).toBeNull()
    expect(mismatchNote('rig2d', 'info', 'a.bin')).toBeNull()
  })
})
