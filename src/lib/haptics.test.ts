import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../native/platform', () => ({ isNative: vi.fn(() => false) }))
vi.mock('../native/plugin', () => ({ FlotsamNative: { haptic: vi.fn(() => Promise.resolve()) } }))

import { isNative } from '../native/platform'
import { FlotsamNative } from '../native/plugin'
import { haptic, WEB_PATTERNS } from './haptics'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.mocked(isNative).mockReturnValue(false)
  vi.mocked(FlotsamNative.haptic).mockClear()
})

describe('haptic', () => {
  it('vibrates on the web when the browser can', () => {
    const vibrate = vi.fn()
    vi.stubGlobal('navigator', { vibrate })
    haptic('success')
    expect(vibrate).toHaveBeenCalledWith(WEB_PATTERNS.success)
  })

  it('does nothing where vibrate does not exist, and never throws', () => {
    vi.stubGlobal('navigator', {})
    expect(() => haptic('tap')).not.toThrow()
    vi.stubGlobal('navigator', {
      vibrate: () => {
        throw new Error('blocked')
      },
    })
    expect(() => haptic('error')).not.toThrow()
  })

  it('uses the native plugin in the Android app instead of the browser', () => {
    const vibrate = vi.fn()
    vi.stubGlobal('navigator', { vibrate })
    vi.mocked(isNative).mockReturnValue(true)
    haptic('error')
    expect(FlotsamNative.haptic).toHaveBeenCalledWith({ type: 'error' })
    expect(vibrate).not.toHaveBeenCalled()
  })
})
