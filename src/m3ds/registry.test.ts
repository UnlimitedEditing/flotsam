import { describe, expect, it } from 'vitest'
import { adultOne, meshFlow, mossTurbo } from '../lib/fixtures'
import {
  defaultSpecForSlug,
  mismatchNote,
  outputSpec,
  showManualM3ds,
  specForJob,
  viewerKind,
  type OutputSpec,
} from './registry'
import type { Workflow } from '../api/types'

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

const wf = (slug: string) => ({ ...mossTurbo, slug }) as Workflow
const score: OutputSpec = { carrier: 'm3ds', expect: 'score' }
const rig: OutputSpec = { carrier: 'm3ds', expect: 'rig2d' }

describe('built-in declarations', () => {
  it('declares the barcoded workflows by slug', () => {
    expect(defaultSpecForSlug('music-yue2')).toEqual(score)
    expect(defaultSpecForSlug('music-yue2-instrumental')).toEqual(score)
    expect(defaultSpecForSlug('trellis2-native')).toEqual({ carrier: 'm3ds', expect: 'model3d' })
    for (const slug of ['rig-direct', 'rig-perform', 'rig-track', 'rig-intent', 'rigstudio-a2f-probe'])
      expect(defaultSpecForSlug(slug)).toEqual(rig)
  })

  it('treats the rig family by name, but not look-alikes', () => {
    expect(defaultSpecForSlug('rig-puppet-parts')).toEqual(rig)
    expect(defaultSpecForSlug('rigstudio-set')).toEqual(rig)
    expect(defaultSpecForSlug('trigger-happy')).toBeNull()
    expect(defaultSpecForSlug('prerig')).toBeNull()
    expect(defaultSpecForSlug('moss-turbo')).toBeNull()
    expect(defaultSpecForSlug('constructor')).toBeNull() // not a prototype lookup
  })

  it('gives ordinary image workflows nothing', () => {
    expect(outputSpec(mossTurbo)).toBeNull()
    expect(outputSpec(wf('edit-one'))).toBeNull()
  })

  it('puts the table before the capability flags, and the override before both', () => {
    expect(outputSpec(wf('music-yue2'))).toEqual(score)
    expect(outputSpec(wf('music-yue2'), { 'music-yue2': null })).toBeNull()
    expect(outputSpec(wf('rig-direct'), { 'rig-direct': { carrier: 'm3ds', expect: 'text' } })).toEqual({
      carrier: 'm3ds',
      expect: 'text',
    })
  })
})

describe('specForJob', () => {
  it('applies the table to history that stored nothing', () => {
    expect(specForJob({ workflowSlug: 'music-yue2' })).toEqual(score)
    expect(specForJob({ workflowSlug: 'moss-turbo' })).toBeNull()
  })
  it('prefers a stored spec over the table, and an override over both', () => {
    const stored: OutputSpec = { carrier: 'm3ds', expect: 'text' }
    expect(specForJob({ workflowSlug: 'music-yue2', output: stored })).toEqual(stored)
    expect(specForJob({ workflowSlug: 'music-yue2', output: stored }, { 'music-yue2': null })).toBeNull()
    expect(specForJob({ workflowSlug: 'moss-turbo' }, { 'moss-turbo': rig })).toEqual(rig)
  })
})

describe('showManualM3ds', () => {
  it('is off unless the advanced setting is on, and only for undeclared pixel results', () => {
    expect(showManualM3ds(null, false, true)).toBe(false) // the default: plain results show no M3DS button
    expect(showManualM3ds(null, true, true)).toBe(true)
    expect(showManualM3ds(null, true, false)).toBe(false) // video/audio results are never M3DS images
    expect(showManualM3ds(score, true, true)).toBe(false) // declared ones have "View result" instead
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
