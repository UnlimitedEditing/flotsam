// Pure helpers for the download page (no I/O, so they are unit-tested). See docs/download-page.md.
export { detectPlatform } from '../site/detect.js'

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function formatSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return ''
  return bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`
}

/** 64 hex characters -> upper-case pairs separated by colons (the format keytool and apksigner users expect). */
export function formatFingerprint(hex) {
  const h = String(hex ?? '')
    .trim()
    .replace(/:/g, '')
  if (!/^[0-9a-fA-F]{64}$/.test(h)) throw new Error('fingerprint must be 64 hex characters')
  return h.toUpperCase().match(/../g).join(':')
}

const HEX64 = /^[0-9a-f]{64}$/

/**
 * version.json (from a PUBLISHED release) -> what the page needs. Everything is validated, because the notes
 * come from commit subjects and the page must never show a link it cannot vouch for: the APK must live under
 * this repository's own releases.
 */
export function modelFromVersionJson(json, { repo, tag }) {
  if (!json || typeof json !== 'object') throw new Error('version.json is not an object')
  const apkPrefix = `https://github.com/${repo}/releases/download/${tag}/`
  if (typeof json.apkUrl !== 'string' || !json.apkUrl.startsWith(apkPrefix) || /[\s"'<>]/.test(json.apkUrl)) {
    throw new Error(`apkUrl must be under ${apkPrefix}`)
  }
  if (!HEX64.test(String(json.sha256 ?? ''))) throw new Error('sha256 must be 64 lowercase hex characters')
  const versionName = String(json.versionName ?? '')
  if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(versionName)) throw new Error('versionName must look like 1.2.3')
  const notes = String(json.notes ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  return {
    versionName,
    versionCode: Number(json.versionCode),
    size: Number(json.size) || 0,
    sha256: json.sha256,
    apkUrl: json.apkUrl,
    apkName: json.apkUrl.slice(apkPrefix.length),
    notes,
    releaseUrl: `https://github.com/${repo}/releases/tag/${tag}`,
  }
}

const NOTE_LIMIT = 12

export function renderPage({ repo, siteUrl, pwaUrl = '', fingerprint, release = null, qrSvg = '' }) {
  const e = escapeHtml
  const fp = formatFingerprint(fingerprint)
  const blob = (p) => `https://github.com/${repo}/blob/master/${p}`

  const shown = release ? release.notes.slice(0, NOTE_LIMIT) : []
  const more = release ? release.notes.length - shown.length : 0

  const android = release
    ? `
      <p class="meta">Version ${e(release.versionName)}${release.size ? ` · ${e(formatSize(release.size))}` : ''} · Android 10 or newer</p>
      <div class="gate" id="android-gate" hidden>
        <label class="check"><input type="checkbox" id="adult" /> <span>I am 18 or older, and I understand this app can show adult and explicit content.</span></label>
        <a class="btn" id="apk-link" data-href="${e(release.apkUrl)}" aria-disabled="true" role="button">Download the Android app (APK)</a>
      </div>
      <noscript><p><a class="btn" href="${e(release.apkUrl)}">Download the Android app (APK)</a></p><p class="meta">By downloading you confirm you are 18 or older.</p></noscript>
      <ol class="steps">
        <li><strong>Open the downloaded file</strong> (from your notifications or the Downloads app).</li>
        <li><strong>Allow installing</strong> when Android asks: switch on &ldquo;Allow from this source&rdquo; for your browser or file manager. This is normal for apps that do not come from the Play Store.</li>
        <li><strong>Tap Install.</strong> If Play Protect says the developer is unknown, choose &ldquo;Install anyway&rdquo; if the checks below match.</li>
      </ol>
      <details class="verify">
        <summary>Check the download is genuine (optional)</summary>
        <p>File checksum (SHA-256):</p>
        <code>${e(release.sha256)}</code>
        <p>Signing certificate (SHA-256), the same for every genuine release:</p>
        <code>${e(fp)}</code>
        <p class="meta">Windows: <code>Get-FileHash ${e(release.apkName)}</code> &nbsp; Any system with the Android SDK: <code>apksigner verify --print-certs ${e(release.apkName)}</code></p>
      </details>
      ${
        shown.length
          ? `<details class="notes"><summary>What&rsquo;s in this version</summary><ul>${shown.map((n) => `<li>${e(n)}</li>`).join('')}</ul>${more > 0 ? `<p class="meta">and ${more} more. <a href="${e(release.releaseUrl)}">Full release notes</a></p>` : ''}</details>`
          : ''
      }`
    : `<p class="empty"><strong>No release has been published yet.</strong> The app is still being prepared; there is nothing to download right now.</p>`

  const ios = pwaUrl
    ? `<ol class="steps">
        <li>Open <a href="${e(pwaUrl)}">${e(pwaUrl)}</a> in <strong>Safari</strong> on your iPhone or iPad.</li>
        <li>Tap the <strong>Share</strong> button.</li>
        <li>Choose <strong>Add to Home Screen</strong>, then open Flotsam from your home screen.</li>
      </ol>
      <p class="meta">On iPhone this is a web app, not a downloaded file. Notifications only work while it is open or just closed.</p>`
    : `<p class="empty">The iPhone version is not available yet.</p>`

  const desktop = `<p>Flotsam is made for phones. Scan this code with your phone to open this page there.</p>
      <div class="qr" role="img" aria-label="QR code linking to ${e(siteUrl)}">${qrSvg}</div>
      <p class="meta">${e(siteUrl)}</p>`

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'self'; script-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'" />
<meta name="color-scheme" content="dark light" />
<meta name="description" content="An independent mobile app for your own Graydient account. Not affiliated with Graydient." />
<title>Flotsam</title>
<link rel="icon" href="data:," />
<link rel="stylesheet" href="style.css" />
</head>
<body>
<main>
  <header>
    <h1>Flotsam</h1>
    <p class="tag">An independent app for using your own Graydient account from your phone.</p>
  </header>

  <aside class="notice" aria-label="Please read">
    <p><strong>Adults only (18+).</strong> Flotsam can show adult and explicit content. It blurs media by default and hides adult workflows until you turn them on.</p>
    <p><strong>Not affiliated with Graydient.</strong> It is not made, endorsed or supported by them. No accounts and no analytics: your API key and history stay on your device.</p>
    <p>The <a href="${e(blob('src/legal/terms.ts'))}">Terms and Content Policy</a> are a draft pending legal review. Privacy details: <a href="${e(blob('docs/privacy-and-terms.md'))}">what is stored and why</a>.</p>
  </aside>

  <section id="android"><details open><summary><h2>Android</h2></summary>${android}</details></section>
  <section id="ios"><details open><summary><h2>iPhone and iPad</h2></summary>${ios}</details></section>
  <section id="desktop"><details open><summary><h2>On a computer</h2></summary>${desktop}</details></section>
</main>
<footer>
  <p><a href="https://github.com/${e(repo)}">Source code</a> · <a href="https://github.com/${e(repo)}/releases">All releases</a> · <a href="${e(blob('docs/release.md'))}">How releases are signed</a></p>
</footer>
<script type="module" src="app.js"></script>
</body>
</html>
`
}
