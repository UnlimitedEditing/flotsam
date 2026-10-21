import { afterEach, describe, expect, it, vi } from 'vitest'
import { createFlip, directionBetween, prefersReducedMotion } from './motion'

const order = ['/', '/workflows', '/queue', '/gallery', '/settings']

afterEach(() => vi.unstubAllGlobals())

describe('prefersReducedMotion', () => {
  it('reads the media query', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    expect(prefersReducedMotion()).toBe(true)
    vi.stubGlobal('matchMedia', () => ({ matches: false }))
    expect(prefersReducedMotion()).toBe(false)
  })
  it('is false where matchMedia is missing or throws', () => {
    vi.stubGlobal('matchMedia', undefined)
    expect(prefersReducedMotion()).toBe(false)
    vi.stubGlobal('matchMedia', () => {
      throw new Error('nope')
    })
    expect(prefersReducedMotion()).toBe(false)
  })
})

describe('directionBetween', () => {
  it('goes forward and back along the tab order', () => {
    expect(directionBetween(order, '/', '/queue')).toBe('forward')
    expect(directionBetween(order, '/settings', '/workflows')).toBe('back')
  })
  it('does not slide on first render, on the same place, or for places outside the order', () => {
    expect(directionBetween(order, null, '/queue')).toBe('none')
    expect(directionBetween(order, '/queue', '/queue')).toBe('none')
    expect(directionBetween(order, '/queue', '/share')).toBe('none')
    expect(directionBetween(order, '/share', '/queue')).toBe('none')
  })
})

describe('createFlip', () => {
  const el = (top: number) =>
    ({ getBoundingClientRect: () => ({ top }), animate: vi.fn() }) as unknown as HTMLElement

  it('animates an item that moved, and leaves unmoved items alone', () => {
    const flip = createFlip()
    const a = el(100)
    const b = el(200)
    flip.measure([
      ['a', a],
      ['b', b],
    ])
    const moved = el(150)
    const still = el(200)
    flip.play([
      ['a', moved],
      ['b', still],
    ])
    expect(moved.animate).toHaveBeenCalledTimes(1)
    expect((moved.animate as ReturnType<typeof vi.fn>).mock.calls[0][0][0]).toEqual({
      transform: 'translateY(-50px)',
    })
    expect(still.animate).not.toHaveBeenCalled()
  })

  it('does nothing for new items or under reduced motion', () => {
    const flip = createFlip()
    flip.measure([['a', el(100)]])
    const brandNew = el(10)
    flip.play([['z', brandNew]])
    expect(brandNew.animate).not.toHaveBeenCalled()

    vi.stubGlobal('matchMedia', () => ({ matches: true }))
    const moved = el(300)
    flip.play([['a', moved]])
    expect(moved.animate).not.toHaveBeenCalled()
  })
})
