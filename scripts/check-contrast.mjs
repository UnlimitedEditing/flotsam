// WCAG AA check of the colour roles in src/styles/tokens.css, for both themes.
//   node scripts/check-contrast.mjs        (exit code 1 if any pair is below its minimum)
import { readFileSync } from 'node:fs'

const css = readFileSync('src/styles/tokens.css', 'utf8')

function block(selector) {
  const start = css.indexOf(selector)
  const open = css.indexOf('{', start)
  let depth = 0
  for (let i = open; i < css.length; i++) {
    if (css[i] === '{') depth++
    if (css[i] === '}' && --depth === 0) return css.slice(open + 1, i)
  }
  throw new Error(`no block for ${selector}`)
}
const vars = (text) => Object.fromEntries([...text.matchAll(/--([a-z0-9-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]))

function parse(c) {
  if (c.startsWith('#')) {
    const h = c.length === 4 ? [...c.slice(1)].map((x) => x + x).join('') : c.slice(1)
    return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: 1 }
  }
  const m = c.match(/rgba?\(([^)]+)\)/)
  if (!m) throw new Error(`cannot parse ${c}`)
  const [r, g, b, a = 1] = m[1].split(',').map(Number)
  return { r, g, b, a }
}
const over = (top, under) => ({
  r: top.r * top.a + under.r * (1 - top.a),
  g: top.g * top.a + under.g * (1 - top.a),
  b: top.b * top.a + under.b * (1 - top.a),
  a: 1,
})
const lum = ({ r, g, b }) => {
  const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
}
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
  return (x + 0.05) / (y + 0.05)
}

const dark = vars(block(':root {'))
const light = { ...dark, ...vars(block(":root[data-theme='light']")) }
let failed = 0
for (const [name, v] of [['dark', dark], ['light', light]]) {
  const c = (k) => parse(v[k])
  const bg = c('abyss')
  const glass = over(c('surface'), bg)
  const pairs = [
    ['text on page', c('fg'), bg, 4.5],
    ['text on glass', c('fg'), glass, 4.5],
    ['muted on page', c('muted'), bg, 4.5],
    ['muted on glass', c('muted'), glass, 4.5],
    ['muted on solid', c('muted'), c('surface-solid'), 4.5],
    ['accent text/links on page', c('accent'), bg, 4.5],
    ['accent text on glass', c('accent'), glass, 4.5],
    ['button label on accent', c('on-accent'), c('accent'), 4.5],
    ['button label on accent-2', c('on-accent'), c('accent-2'), 4.5],
    ['error on page', c('err'), bg, 4.5],
    ['error on glass', c('err'), glass, 4.5],
    ['warm on page', c('warm'), bg, 3],
  ]
  for (const [label, fg, back, min] of pairs) {
    const r = ratio(fg, back)
    const ok = r >= min
    if (!ok) failed++
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(5)} ${label.padEnd(28)} ${r.toFixed(2)} (min ${min})`)
  }
}
if (failed) {
  console.error(`${failed} pair(s) below minimum`)
  process.exitCode = 1
}
