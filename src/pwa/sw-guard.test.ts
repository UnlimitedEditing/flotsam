/// <reference types="node" />
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Safety net for the NSFW rule: the service worker may precache our own app shell and nothing else.
// Generated media, API responses, uploads and M3DS images must never reach Cache Storage.
// Runs against the built service worker, so `npm test` builds first.
const swPath = resolve(__dirname, '../../dist/sw.js')

describe('built service worker', () => {
  it('exists (run `npm test`, which builds first)', () => {
    expect(existsSync(swPath)).toBe(true)
  })

  const sw = existsSync(swPath) ? readFileSync(swPath, 'utf8') : ''

  it('precaches the shell and has no runtime caching strategies', () => {
    expect(sw).toContain('precacheAndRoute')
    for (const banned of [
      'CacheFirst',
      'StaleWhileRevalidate',
      'NetworkFirst',
      'CacheOnly',
      'ExpirationPlugin',
    ]) {
      expect(sw, `${banned} would cache responses at runtime`).not.toContain(banned)
    }
  })

  it('registers only the navigation fallback route', () => {
    const calls = sw.match(/registerRoute\([^)]*\)/g) ?? []
    expect(calls.length).toBeGreaterThan(0)
    for (const c of calls) expect(c).toMatch(/NavigationRoute|createHandlerBoundToURL/)
  })

  it('precaches only same-origin relative files', () => {
    const urls = [...sw.matchAll(/url:"([^"]+)"/g)].map((m) => m[1])
    expect(urls.length).toBeGreaterThan(3)
    for (const u of urls) expect(u).not.toMatch(/^(https?:)?\/\//)
  })

  it('loads the notification click handler', () => {
    expect(sw).toContain('sw-notify.js')
  })
})
