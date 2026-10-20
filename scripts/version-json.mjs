// Pure helpers for building the self-updater's version.json (no I/O, so they are unit-tested).
// Format (also documented in docs/updates.md):
//   { versionCode, versionName, minSupportedVersionCode, apkUrl, sha256, size, notes }

/** Reads versionCode / versionName from the text of `aapt2 dump badging <apk>`. */
export function parseBadging(text) {
  const m = text.match(/^package: .*?versionCode='(\d+)'.*?versionName='([^']*)'/m)
  if (!m) throw new Error('Could not read versionCode/versionName from the aapt2 output')
  const name = text.match(/^package: name='([^']+)'/m)
  return { versionCode: Number(m[1]), versionName: m[2], packageName: name ? name[1] : null }
}

export function buildVersionJson({ badging, apkUrl, sha256, size, notes = '', minSupportedVersionCode }) {
  if (!/^https:\/\//.test(apkUrl)) throw new Error('apkUrl must be https')
  if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error('sha256 must be 64 lowercase hex characters')
  const min = minSupportedVersionCode ?? 1
  if (!Number.isInteger(min) || min < 1 || min > badging.versionCode) {
    throw new Error('minSupportedVersionCode must be between 1 and the new versionCode')
  }
  return {
    versionCode: badging.versionCode,
    versionName: badging.versionName,
    minSupportedVersionCode: min,
    apkUrl,
    sha256,
    size,
    notes,
  }
}
