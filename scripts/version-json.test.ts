import { describe, expect, it } from 'vitest'
// @ts-expect-error plain ESM script without type declarations
import { buildVersionJson, parseBadging } from './version-json.mjs'

const badging = `package: name='app.flotsam.client' versionCode='12' versionName='1.3.0' platformBuildVersionName='16'
sdkVersion:'29'`
const sha = 'a'.repeat(64)

describe('parseBadging', () => {
  it('reads package, versionCode and versionName from aapt2 output', () => {
    expect(parseBadging(badging)).toEqual({
      versionCode: 12,
      versionName: '1.3.0',
      packageName: 'app.flotsam.client',
    })
  })
  it('fails clearly on unexpected output', () => {
    expect(() => parseBadging('nothing useful')).toThrow(/versionCode/)
  })
})

describe('buildVersionJson', () => {
  const base = {
    badging: parseBadging(badging),
    apkUrl: 'https://dl.example/app/flotsam-1.3.0.apk',
    sha256: sha,
    size: 22_000_000,
  }
  it('produces the documented shape', () => {
    expect(buildVersionJson({ ...base, notes: 'Faster gallery', minSupportedVersionCode: 9 })).toEqual({
      versionCode: 12,
      versionName: '1.3.0',
      minSupportedVersionCode: 9,
      apkUrl: 'https://dl.example/app/flotsam-1.3.0.apk',
      sha256: sha,
      size: 22_000_000,
      notes: 'Faster gallery',
    })
  })
  it('defaults the minimum to 1 and rejects bad input', () => {
    expect(buildVersionJson(base).minSupportedVersionCode).toBe(1)
    expect(() => buildVersionJson({ ...base, apkUrl: 'http://x/a.apk' })).toThrow(/https/)
    expect(() => buildVersionJson({ ...base, sha256: 'nothex' })).toThrow(/sha256/)
    expect(() => buildVersionJson({ ...base, minSupportedVersionCode: 99 })).toThrow(/minSupported/)
    expect(() => buildVersionJson({ ...base, minSupportedVersionCode: 0 })).toThrow(/minSupported/)
  })
})
