// Used by the release workflow: turns the pushed tag into everything the build needs.
//
//   node scripts/release-info.mjs <tag> [--github-output <file>] [--notes-md <file>] [--notes-txt <file>]
//
// Prints (and appends to $GITHUB_OUTPUT if given): versionName, versionCode, minSupported.
// Writes release notes from the commit subjects since the previous tag.
import { execFileSync } from 'node:child_process'
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { buildNotes, parseMinSupported, versionFromTag } from './release-lib.mjs'

const args = process.argv.slice(2)
const tag = args[0]
const opt = (name) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : undefined
}
if (!tag) {
  console.error(
    'usage: node scripts/release-info.mjs <tag> [--github-output file] [--notes-md file] [--notes-txt file]',
  )
  process.exit(2)
}

const git = (...a) => execFileSync('git', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
const { versionName, versionCode } = versionFromTag(tag)

let min = 1
try {
  min = parseMinSupported(readFileSync('android/min-supported-version-code.txt', 'utf8'), versionCode)
} catch (e) {
  if (e.code !== 'ENOENT') throw e
}

let previous = ''
try {
  previous = git('describe', '--tags', '--abbrev=0', '--match', 'v*', `${tag}^`)
} catch {
  /* first release: no earlier tag */
}
const subjects = git('log', previous ? `${previous}..${tag}` : tag, '--pretty=%s').split('\n')
const notes = buildNotes(subjects, { max: 2000, title: `Flotsam ${versionName}` })

const outFile = opt('--github-output')
const lines = [`versionName=${versionName}`, `versionCode=${versionCode}`, `minSupported=${min}`]
console.log(lines.join('\n'))
if (outFile) appendFileSync(outFile, lines.join('\n') + '\n')
if (opt('--notes-md')) writeFileSync(opt('--notes-md'), notes.markdown + '\n')
if (opt('--notes-txt')) writeFileSync(opt('--notes-txt'), notes.plain)
