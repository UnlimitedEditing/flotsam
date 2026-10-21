import { describe, expect, it } from 'vitest'
// @ts-expect-error plain ESM script without type declarations
import {
  detectPlatform,
  escapeHtml,
  formatFingerprint,
  formatSize,
  modelFromVersionJson,
  renderPage,
} from './site-lib.mjs'

const repo = 'UnlimitedEditing/flotsam'
const tag = 'v0.1.0'
const sha = 'a'.repeat(64)
const fp = '648a7c2c58a720d1445a21ea1d693d1bf93fa95302dd607d4c967568c1a250d4'
const versionJson = {
  versionCode: 1000,
  versionName: '0.1.0',
  minSupportedVersionCode: 1,
  apkUrl: `https://github.com/${repo}/releases/download/${tag}/flotsam-0.1.0.apk`,
  sha256: sha,
  size: 18_333_976,
  notes: 'First change\nSecond change',
}
const base = {
  repo,
  siteUrl: `https://unlimitedediting.github.io/flotsam/`,
  fingerprint: fp,
  qrSvg: '<svg></svg>',
}

describe('detectPlatform', () => {
  const ua = {
    pixel:
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36',
    samsung:
      'Mozilla/5.0 (Linux; Android 13; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/24.0 Chrome/117.0.0.0 Mobile Safari/537.36',
    iphone:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    ipad: 'Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    ipadDesktop:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
    mac: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    windows:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    linux: 'Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0',
  }
  it('recognises phones and tablets', () => {
    expect(detectPlatform(ua.pixel, 5)).toBe('android')
    expect(detectPlatform(ua.samsung, 5)).toBe('android')
    expect(detectPlatform(ua.iphone, 5)).toBe('ios')
    expect(detectPlatform(ua.ipad, 5)).toBe('ios')
  })
  it('treats an iPad that reports as a Mac (touch screen) as iOS, but a real Mac as desktop', () => {
    expect(detectPlatform(ua.ipadDesktop, 5)).toBe('ios')
    expect(detectPlatform(ua.mac, 0)).toBe('desktop')
    expect(detectPlatform(ua.ipadDesktop, 0)).toBe('desktop')
  })
  it('falls back to desktop', () => {
    expect(detectPlatform(ua.windows)).toBe('desktop')
    expect(detectPlatform(ua.linux)).toBe('desktop')
    expect(detectPlatform('')).toBe('desktop')
    expect(detectPlatform(undefined)).toBe('desktop')
  })
})

describe('formatting', () => {
  it('formats sizes and fingerprints', () => {
    expect(formatSize(18_333_976)).toBe('17.5 MB')
    expect(formatSize(500_000)).toBe('488 KB')
    expect(formatSize(0)).toBe('')
    expect(formatFingerprint(fp)).toBe(
      '64:8A:7C:2C:58:A7:20:D1:44:5A:21:EA:1D:69:3D:1B:F9:3F:A9:53:02:DD:60:7D:4C:96:75:68:C1:A2:50:D4',
    )
    expect(() => formatFingerprint('nope')).toThrow()
  })
  it('escapes html', () => {
    expect(escapeHtml(`<img src=x onerror="a('b')">&`)).toBe(
      '&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;',
    )
  })
})

describe('modelFromVersionJson', () => {
  it('accepts a release for this repository', () => {
    const m = modelFromVersionJson(versionJson, { repo, tag })
    expect(m).toMatchObject({
      versionName: '0.1.0',
      size: 18_333_976,
      apkName: 'flotsam-0.1.0.apk',
      notes: ['First change', 'Second change'],
    })
    expect(m.releaseUrl).toBe(`https://github.com/${repo}/releases/tag/${tag}`)
  })
  it('refuses links it cannot vouch for', () => {
    const bad = (over: object) => () => modelFromVersionJson({ ...versionJson, ...over }, { repo, tag })
    expect(bad({ apkUrl: 'https://evil.example/flotsam.apk' })).toThrow(/apkUrl/)
    expect(bad({ apkUrl: `https://github.com/other/repo/releases/download/${tag}/a.apk` })).toThrow(/apkUrl/)
    expect(bad({ apkUrl: `https://github.com/${repo}/releases/download/${tag}/a"onclick=x.apk` })).toThrow(
      /apkUrl/,
    )
    expect(bad({ sha256: 'abc' })).toThrow(/sha256/)
    expect(bad({ versionName: '1.0.0-evil<script>' })).toThrow(/versionName/)
    expect(() => modelFromVersionJson(null, { repo, tag })).toThrow()
  })
})

describe('renderPage', () => {
  const withRelease = () => renderPage({ ...base, release: modelFromVersionJson(versionJson, { repo, tag }) })
  const none = () => renderPage({ ...base, release: null })

  it('shows the version, size, hashes and the install steps for a published release', () => {
    const html = withRelease()
    expect(html).toContain('Version 0.1.0')
    expect(html).toContain('17.5 MB')
    expect(html).toContain(sha)
    expect(html).toContain('64:8A:7C:2C')
    expect(html).toContain('Allow installing')
    expect(html).toContain('apksigner verify')
  })

  it('keeps the 18+ step in front of the download: no APK href outside <noscript>', () => {
    const html = withRelease()
    const withoutNoscript = html.replace(/<noscript>[\s\S]*?<\/noscript>/g, '')
    // A real href attribute (preceded by whitespace; data-href is the inert placeholder) must not point at the APK:
    // the link only gets its destination after the checkbox is ticked.
    expect(withoutNoscript).not.toMatch(/\shref="[^"]*\.apk"/)
    expect(html).toContain('data-href=')
    expect(html).toContain('I am 18 or older')
    expect(html).toMatch(/<noscript>[\s\S]*\.apk[\s\S]*<\/noscript>/) // no-JS fallback still works
  })

  it('offers nothing to download before a release is published', () => {
    const html = none()
    expect(html).toContain('No release has been published yet')
    expect(html).not.toContain('.apk')
    expect(html).not.toContain('apk-link')
  })

  it('shows the iPhone steps only when a web-app address is configured', () => {
    expect(none()).toContain('The iPhone version is not available yet')
    const html = renderPage({ ...base, pwaUrl: 'https://flotsam.pages.dev/', release: null })
    expect(html).toContain('Add to Home Screen')
    expect(html).toContain('https://flotsam.pages.dev/')
  })

  it('always carries the notices: 18+, not affiliated, draft terms, no tracking', () => {
    for (const html of [withRelease(), none()]) {
      expect(html).toContain('Adults only (18+)')
      expect(html).toContain('Not affiliated with Graydient')
      expect(html).toContain('draft pending legal review')
      expect(html).toContain('No accounts and no analytics')
    }
  })

  it('escapes hostile release notes', () => {
    const hostile = { ...versionJson, notes: '<script>alert(1)</script>\n<img src=x onerror=alert(2)>' }
    const html = renderPage({ ...base, release: modelFromVersionJson(hostile, { repo, tag }) })
    expect(html).not.toContain('<script>alert')
    expect(html).not.toContain('<img src=x')
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
  })

  it('caps the notes list and links to the full notes', () => {
    const many = { ...versionJson, notes: Array.from({ length: 30 }, (_, i) => `Change ${i}`).join('\n') }
    const html = renderPage({ ...base, release: modelFromVersionJson(many, { repo, tag }) })
    expect(html).toContain('Change 11')
    expect(html).not.toContain('Change 12<')
    expect(html).toContain('and 18 more')
  })

  it('is a strict, self-contained page: CSP, no third-party hosts, no inline scripts or styles', () => {
    const html = withRelease()
    expect(html).toContain("default-src 'none'")
    expect(html).toContain("script-src 'self'")
    expect(html).not.toMatch(/<script(?![^>]*src=)[^>]*>/) // no inline scripts
    expect(html).not.toMatch(/style=/) // no inline styles (CSP blocks them)
    const hosts = new Set([...html.matchAll(/https?:\/\/([^/"'\s<]+)/g)].map((m) => m[1]))
    // The one hostname that is not a GitHub link is the page's own address (QR label and footer text).
    for (const h of hosts)
      expect(['github.com', 'unlimitedediting.github.io', 'www.w3.org'].includes(h), h).toBe(true)
  })

  it('embeds the QR code for the page address', () => {
    expect(withRelease()).toContain('<svg></svg>')
    expect(withRelease()).toContain('https://unlimitedediting.github.io/flotsam/')
  })
})
