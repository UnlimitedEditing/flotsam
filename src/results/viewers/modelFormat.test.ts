import { describe, expect, it } from 'vitest'
import { identifyPayload } from '../../m3ds/registry'
import { modelFormat } from './modelFormat'

const bytes = (s: string) => new TextEncoder().encode(s)

describe('modelFormat', () => {
  it('reads signatures before names', () => {
    expect(modelFormat('x.bin', bytes('glTF\u0002\u0000\u0000\u0000'))).toBe('glb')
    expect(modelFormat('x.bin', bytes('ply\nformat ascii 1.0\n'))).toBe('ply')
    expect(modelFormat('x.bin', bytes('ply\r\nformat ascii 1.0\r\n'))).toBe('ply')
    expect(modelFormat('plywood.txt', bytes('plywood'))).toBeNull() // "ply" without a line break is not a PLY
  })

  it('falls back to the file name', () => {
    expect(modelFormat('a.GLB', bytes('{}'))).toBe('glb')
    expect(modelFormat('a.gltf', bytes('{}'))).toBe('gltf')
    expect(modelFormat('mesh.stl', bytes('solid x'))).toBe('stl')
    expect(modelFormat('mesh.obj', bytes('v 0 0 0'))).toBe('obj')
    expect(modelFormat('mesh.ply', bytes('x'))).toBe('ply')
    expect(modelFormat('notes.txt', bytes('hello'))).toBeNull()
    expect(modelFormat('noext', bytes('hello'))).toBeNull()
  })

  it('agrees with how payloads are identified', () => {
    for (const f of ['m.glb', 'm.gltf', 'm.ply', 'm.stl', 'm.obj'])
      expect(identifyPayload(f, bytes('data'))).toBe('model')
    expect(identifyPayload('noext', bytes('ply\nformat ascii 1.0\n'))).toBe('model')
    expect(identifyPayload('notes.txt', bytes('hello'))).toBe('text')
  })
})
