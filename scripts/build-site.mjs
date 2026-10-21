// Builds the static download page into site-dist/.
//
//   node scripts/build-site.mjs [--version-json file --tag vX.Y.Z] [--out site-dist] [--site-url url]
//
// With a version.json (from a PUBLISHED release) the page offers the download; without one it says no release
// has been published yet. Only the release workflow passes a version.json; drafts never reach this page.
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import QRCode from 'qrcode'
import { modelFromVersionJson, renderPage } from './site-lib.mjs'

const args = process.argv.slice(2)
const opt = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : fallback
}

const config = JSON.parse(readFileSync('site/config.json', 'utf8'))
const fingerprint = readFileSync('release/signing-fingerprint.txt', 'utf8').trim()
const out = opt('--out', 'site-dist')
const siteUrl = opt('--site-url', config.siteUrl)

let release = null
const versionJson = opt('--version-json')
if (versionJson) {
  const tag = opt('--tag')
  if (!tag) throw new Error('--tag is required with --version-json')
  release = modelFromVersionJson(JSON.parse(readFileSync(versionJson, 'utf8')), { repo: config.repo, tag })
}

const qrSvg = await QRCode.toString(siteUrl, { type: 'svg', margin: 0, errorCorrectionLevel: 'M' })

mkdirSync(out, { recursive: true })
writeFileSync(join(out, 'index.html'), renderPage({ ...config, siteUrl, fingerprint, release, qrSvg }))
for (const f of ['style.css', 'app.js', 'detect.js']) copyFileSync(join('site', f), join(out, f))
writeFileSync(join(out, '.nojekyll'), '')
console.log(`Built ${out}/ (${release ? `release ${release.versionName}` : 'no release yet'}) for ${siteUrl}`)
