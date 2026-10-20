// Builds version.json for a release APK.
//
//   node scripts/make-version-json.mjs <apk> <public-apk-url> [--notes "text"] [--min <versionCode>] [--out version.json]
//
// Reads versionCode/versionName with aapt2 (ANDROID_HOME/build-tools/*/aapt2), computes SHA-256 and size.
// Upload the APK and the generated version.json to the same host (the app only accepts an APK URL on the
// same host as version.json).
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { buildVersionJson, parseBadging } from './version-json.mjs'

function findAapt2() {
  const home = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT
  if (!home) throw new Error('Set ANDROID_HOME so aapt2 can be found')
  const tools = join(home, 'build-tools')
  const versions = readdirSync(tools).sort().reverse()
  for (const v of versions) {
    for (const exe of ['aapt2.exe', 'aapt2']) {
      const p = join(tools, v, exe)
      if (existsSync(p)) return p
    }
  }
  throw new Error(`aapt2 not found under ${tools}`)
}

const args = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : fallback
}
const [apk, apkUrl] = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')))
if (!apk || !apkUrl) {
  console.error(
    'usage: node scripts/make-version-json.mjs <apk> <public-apk-url> [--notes text] [--min code] [--out file]',
  )
  process.exit(2)
}

const badging = parseBadging(
  execFileSync(findAapt2(), ['dump', 'badging', apk], { encoding: 'utf8', maxBuffer: 1 << 26 }),
)
const sha256 = createHash('sha256').update(readFileSync(apk)).digest('hex')
const min = flag('--min')
const json = buildVersionJson({
  badging,
  apkUrl,
  sha256,
  size: statSync(apk).size,
  notes: flag('--notes', ''),
  minSupportedVersionCode: min ? Number(min) : undefined,
})
const out = flag('--out', 'version.json')
writeFileSync(out, JSON.stringify(json, null, 2) + '\n')
console.log(
  `Wrote ${out}: ${badging.packageName} ${json.versionName} (code ${json.versionCode}), ${json.size} bytes, sha256 ${sha256.slice(0, 12)}...`,
)
