import { describe, expect, it } from 'vitest'
// @ts-expect-error plain ESM script without type declarations
import { buildNotes, parseMinSupported, versionFromTag } from './release-lib.mjs'

describe('versionFromTag', () => {
  it('maps vMAJOR.MINOR.PATCH to a name and an increasing code', () => {
    expect(versionFromTag('v1.3.0')).toEqual({ versionName: '1.3.0', versionCode: 1_003_000 })
    expect(versionFromTag('v0.1.0')).toEqual({ versionName: '0.1.0', versionCode: 1_000 })
    expect(versionFromTag('v12.34.56')).toEqual({ versionName: '12.34.56', versionCode: 12_034_056 })
  })

  it('always increases with the version', () => {
    const order = [
      'v0.1.0',
      'v0.1.1',
      'v0.2.0',
      'v0.10.0',
      'v1.0.0',
      'v1.0.1',
      'v1.2.9',
      'v1.10.0',
      'v2.0.0',
    ].map((t) => versionFromTag(t).versionCode)
    expect(order).toEqual([...order].sort((a, b) => a - b))
    expect(new Set(order).size).toBe(order.length)
  })

  it('stays inside a 32-bit int for the largest allowed tag', () => {
    expect(versionFromTag('v999.999.999').versionCode).toBeLessThan(2 ** 31)
  })

  it('rejects anything that is not a plain three-part tag', () => {
    for (const bad of [
      '1.3.0',
      'v1.3',
      'v1.3.0-rc1',
      'v1.3.0+x',
      'v01.3.0',
      'v1.3.1000',
      'v1000.0.0',
      'release',
      '',
      'v1.3.0 ',
    ]) {
      if (bad === 'v1.3.0 ') continue // surrounding whitespace is trimmed
      expect(() => versionFromTag(bad), bad).toThrow()
    }
    expect(versionFromTag('v1.3.0 ').versionName).toBe('1.3.0')
  })
})

describe('buildNotes', () => {
  it('lists commit subjects, dropping merges, WIP, duplicates and phase prefixes', () => {
    const n = buildNotes([
      'Phase 3A: Gate in the client',
      'Merge branch x',
      'wip stuff',
      'Gate in the client',
      'Fix lock timing',
      '',
    ])
    expect(n.markdown).toBe('- Gate in the client\n- Fix lock timing')
    expect(n.plain).toBe('Gate in the client\nFix lock timing')
  })

  it('has a fallback and a title, and trims the plain text to the manifest limit', () => {
    expect(buildNotes([], { title: 'v1.0.0' }).markdown).toBe('## v1.0.0\n\n- Maintenance release')
    const long = buildNotes(
      Array.from({ length: 400 }, (_, i) => `Change number ${i} with a fairly long description`),
      { max: 2000 },
    )
    expect(long.plain.length).toBeLessThanOrEqual(2000)
    expect(long.plain.length).toBeGreaterThan(1900)
    expect(long.plain.endsWith('description')).toBe(true) // cut on a line boundary, not mid-sentence
  })
})

describe('parseMinSupported', () => {
  it('defaults to 1 and reads a number', () => {
    expect(parseMinSupported('', 5)).toBe(1)
    expect(parseMinSupported('  \n', 5)).toBe(1)
    expect(parseMinSupported('1003000\n', 1_003_000)).toBe(1_003_000)
  })
  it('rejects junk, zero, and a minimum above the release itself', () => {
    expect(() => parseMinSupported('abc', 5)).toThrow(/whole number/)
    expect(() => parseMinSupported('0', 5)).toThrow(/at least 1/)
    expect(() => parseMinSupported('9', 5)).toThrow(/higher than/)
  })
})
