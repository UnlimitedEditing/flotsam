import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const css = readFileSync('src/index.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

/** The declarations of every rule whose selector list includes `selector`. */
function declarations(selector: string): string[] {
  const out: string[] = []
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selectors = m[1].split(',').map((x) => x.trim())
    if (selectors.includes(selector)) out.push(m[2])
  }
  return out
}

describe('the privacy cover hides instantly', () => {
  it('has no transition or animation of its own', () => {
    const rules = declarations('.privacy-cover').join('\n')
    expect(rules).toContain('position: fixed')
    expect(rules).toMatch(/animation:\s*none/)
    expect(rules).toMatch(/transition:\s*none/)
  })

  it('is not inside an animated page wrapper', () => {
    // PrivacyCover and the lock screen render outside .view-page (see App.tsx), which is the only element that animates routes.
    const app = readFileSync('src/App.tsx', 'utf8')
    const shell = app.slice(app.indexOf('function AnimatedView'), app.indexOf('function Shell'))
    expect(shell).not.toMatch(/PrivacyCover|LockScreen/)
  })
})

describe('motion respects reduced motion', () => {
  it('collapses durations and animation in tokens.css', () => {
    const tokens = readFileSync('src/styles/tokens.css', 'utf8')
    expect(tokens).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*--dur-1:\s*1ms/)
    expect(tokens).toMatch(/animation-duration:\s*1ms !important/)
  })
})
