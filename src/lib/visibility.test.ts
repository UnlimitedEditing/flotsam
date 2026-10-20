import { describe, expect, it } from 'vitest'
import { adultOne, mossTurbo } from './fixtures'
import { isVisible, visibleWorkflows } from './visibility'

describe('adult visibility', () => {
  it('hides is_nsfw workflows by default and shows them when enabled', () => {
    expect(visibleWorkflows([mossTurbo, adultOne], false)).toEqual([mossTurbo])
    expect(visibleWorkflows([mossTurbo, adultOne], true)).toEqual([mossTurbo, adultOne])
    expect(isVisible(adultOne, false)).toBe(false)
    expect(isVisible(mossTurbo, false)).toBe(true)
  })
})
