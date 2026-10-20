// Pure helpers for cutting a release (no I/O, so they are unit-tested).

const TAG = /^v(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})\.(0|[1-9]\d{0,2})$/

/**
 * `vMAJOR.MINOR.PATCH` -> { versionName, versionCode }.
 * versionCode = MAJOR*1,000,000 + MINOR*1,000 + PATCH: strictly increases with the version, fits Android's int,
 * and allows up to 999 per part. Anything that is not a plain three-part tag is rejected, so a typo can never
 * produce a release with a lower code than an earlier one.
 */
export function versionFromTag(tag) {
  const m = TAG.exec(String(tag).trim())
  if (!m) throw new Error(`Tag "${tag}" is not of the form vMAJOR.MINOR.PATCH (each part 0-999, no suffix)`)
  const [major, minor, patch] = [Number(m[1]), Number(m[2]), Number(m[3])]
  return { versionName: `${major}.${minor}.${patch}`, versionCode: major * 1_000_000 + minor * 1_000 + patch }
}

const SKIP = /^(merge\b|wip\b|fixup!|squash!)/i

/** Commit subjects -> release notes (markdown for the GitHub release, plain text for version.json). */
export function buildNotes(subjects, { max = 2000, title = '' } = {}) {
  const lines = []
  const seen = new Set()
  for (const raw of subjects) {
    const s = raw.trim().replace(/^Phase \d+[A-Z/]*:\s*/i, '')
    if (!s || SKIP.test(s) || seen.has(s)) continue
    seen.add(s)
    lines.push(s)
  }
  const markdown =
    (title ? `## ${title}\n\n` : '') +
    (lines.length ? lines.map((l) => `- ${l}`).join('\n') : '- Maintenance release')
  const plain = (lines.length ? lines.join('\n') : 'Maintenance release').slice(0, max)
  return { markdown, plain }
}

/** `android/min-supported-version-code.txt` -> a positive integer (default 1 for an empty file). */
export function parseMinSupported(text, versionCode) {
  const t = String(text ?? '').trim()
  if (t === '') return 1
  if (!/^\d+$/.test(t))
    throw new Error(`min-supported-version-code.txt must contain a whole number, got "${t}"`)
  const n = Number(t)
  if (n < 1) throw new Error('min-supported-version-code.txt must be at least 1')
  if (versionCode != null && n > versionCode) {
    throw new Error(
      `min-supported-version-code.txt (${n}) is higher than this release's versionCode (${versionCode})`,
    )
  }
  return n
}
