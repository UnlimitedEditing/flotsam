import { describe, expect, it } from 'vitest'
import { adultOne, img2img, meshFlow, mossTurbo, multiRef, video } from './fixtures'
import { base64ToBlob, imageWorkflows, jobIdFromUrl } from './shareTargets'

describe('imageWorkflows (what a shared image can be used with)', () => {
  const all = [mossTurbo, img2img, multiRef, video, meshFlow, adultOne]
  it('keeps only workflows with an image input slot, hiding adult ones by default', () => {
    expect(imageWorkflows(all, false).map((w) => w.slug)).toEqual([
      'edit-one',
      'multiref',
      'animate',
      'to-mesh',
    ])
  })
  it('shows adult workflows only when enabled, and filters by search', () => {
    expect(imageWorkflows([...all], true).length).toBe(4) // the adult fixture has no image slot either way
    expect(imageWorkflows(all, false, 'ANIM').map((w) => w.slug)).toEqual(['animate'])
    expect(imageWorkflows(all, false, 'zzz')).toEqual([])
  })
})

describe('base64ToBlob', () => {
  it('round-trips bytes and keeps the media type', async () => {
    const blob = base64ToBlob(btoa('hello'), 'image/jpeg')
    expect(blob.type).toBe('image/jpeg')
    expect(await blob.text()).toBe('hello')
  })
})

describe('jobIdFromUrl (notification deep link)', () => {
  it('extracts the job id', () => {
    expect(jobIdFromUrl('flotsam://job/abc123')).toBe('abc123')
    expect(jobIdFromUrl('flotsam://job/abc%20d?x=1#y')).toBe('abc d')
  })
  it('ignores other links', () => {
    expect(jobIdFromUrl('https://example.com/job/abc')).toBeNull()
    expect(jobIdFromUrl('flotsam://other/abc')).toBeNull()
    expect(jobIdFromUrl('flotsam://job/')).toBeNull()
  })
})
