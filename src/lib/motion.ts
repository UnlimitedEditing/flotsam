import { useEffect, useState } from 'react'

/** True when the user (or the OS) asked for less motion. Safe where matchMedia does not exist (tests, old WebViews). */
export function prefersReducedMotion(): boolean {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion)
  useEffect(() => {
    if (typeof matchMedia !== 'function') return
    const q = matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setReduced(q.matches)
    q.addEventListener?.('change', on)
    return () => q.removeEventListener?.('change', on)
  }, [])
  return reduced
}

export type Direction = 'forward' | 'back' | 'none'

/**
 * Which way a move between ordered places goes. Unknown places (or the first render) give 'none'
 * so detail screens simply fade in rather than pretending to slide from a tab.
 */
export function directionBetween(order: readonly string[], from: string | null, to: string): Direction {
  if (from === null || from === to) return 'none'
  const a = order.indexOf(from)
  const b = order.indexOf(to)
  if (a < 0 || b < 0) return 'none'
  return b > a ? 'forward' : 'back'
}

/** Direction of the latest change of `place`, remembered across renders. */
export function useDirection(order: readonly string[], place: string): Direction {
  const [seen, setSeen] = useState<{ prev: string | null; place: string }>({ prev: null, place })
  if (seen.place !== place) setSeen({ prev: seen.place, place })
  return directionBetween(order, seen.prev, place)
}

/**
 * FLIP: animate list items from their old position to their new one. Call `measure()` before the change
 * and `play()` after it (in a layout effect). Items whose position did not change are left alone,
 * only transform is animated, and nothing happens under reduced motion.
 */
export function createFlip(duration = 220) {
  const first = new Map<string, number>()
  return {
    measure(items: Iterable<[string, HTMLElement]>) {
      first.clear()
      for (const [key, el] of items) first.set(key, el.getBoundingClientRect().top)
    },
    play(items: Iterable<[string, HTMLElement]>) {
      if (prefersReducedMotion()) return
      for (const [key, el] of items) {
        const before = first.get(key)
        if (before === undefined) continue
        const delta = before - el.getBoundingClientRect().top
        if (Math.abs(delta) < 1) continue
        el.animate?.([{ transform: `translateY(${delta}px)` }, { transform: 'translateY(0)' }], {
          duration,
          easing: 'cubic-bezier(0.2, 0, 0, 1)',
        })
      }
    },
  }
}
