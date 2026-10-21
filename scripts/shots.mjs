// Screenshots every screen at three widths in dark and light against the local mock API.
//   node shots.mjs <dist dir> <out dir>   (needs puppeteer-core, like e2e-pwa.mjs)
// End-to-end check of the PWA against a LOCAL MOCK of the Graydient API (no real key, no real account).
//   VITE_API_BASE=http://localhost:8095/api/v3/ vite build --outDir dist-e2e   (done by the caller)
//   node e2e-pwa.mjs [dist-e2e dir]      (SHOTS=<dir> to save screenshots; needs puppeteer-core, see docs/test-checklist.md)
// Prints one JSON object of results; each key is a checklist item.
import { createServer } from 'node:http'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import puppeteer from 'puppeteer-core'

const DIST = resolve(process.argv[2] ?? 'dist-e2e')
const API = 8095
const APP = 8096
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)
const apiLog = []
const field = (local_field, default_value = null) => ({
  local_field,
  default_value,
  minimum_value: null,
  maximum_value: null,
  help_text: '',
})
const workflow = {
  id: '1',
  attributes: {
    slug: 'moss-turbo',
    name: 'moss-turbo',
    description: 'mock',
    is_nsfw: false,
    field_mapping: [field('prompt_positive'), field('seed', 42), field('steps', 8)],
    supports_txt2img: true,
    supports_img2img: false,
    supports_txt2vid: false,
    supports_img2vid: false,
    supports_vid2vid: false,
    supports_txt2wav: false,
  },
}
const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
}
const mock = createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${API}`)
  apiLog.push(`${req.method} ${url.pathname} auth=${req.headers.authorization ? 'yes' : 'no'}`)
  if (req.method === 'OPTIONS') return res.writeHead(204, cors).end()
  if (url.pathname === '/img.png')
    return res.writeHead(200, { ...cors, 'content-type': 'image/png' }).end(PNG)
  if (url.pathname.endsWith('/workflows/'))
    return res
      .writeHead(200, { ...cors, 'content-type': 'application/json' })
      .end(JSON.stringify({ data: [workflow], links: {} }))
  const imgs = [
    {
      url: `http://localhost:${API}/img.png`,
      media: [{ url: `http://localhost:${API}/img.png`, media_type: 'image/png' }],
    },
  ]
  if (req.method === 'POST' && url.pathname.endsWith('/render/')) {
    res.writeHead(200, { ...cors, 'content-type': 'text/event-stream' })
    res.write(
      'data: {"event":"render_queued","data":{"render_hash":"mockhash1","estimated_render_time":1}}\n\n',
    )
    setTimeout(() => {
      res.write('data: {"event":"rendering_started","data":{}}\n\n')
      res.write(
        `data: ${JSON.stringify({ event: 'rendering_done', data: { render_hash: 'mockhash1', images: imgs } })}\n\n`,
      )
      res.end()
    }, 300)
    return
  }
  if (url.pathname.includes('/render/mockhash1'))
    return res
      .writeHead(200, { ...cors, 'content-type': 'application/json' })
      .end(JSON.stringify({ data: { attributes: { images: imgs, status: 'done' } } }))
  res.writeHead(404, cors).end('{}')
})
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
}
const stat = createServer((req, res) => {
  let p = join(DIST, decodeURIComponent(new URL(req.url, 'http://x').pathname))
  if (!existsSync(p) || statSync(p).isDirectory()) p = join(DIST, 'index.html')
  res
    .writeHead(200, {
      'content-type': types[extname(p)] ?? 'application/octet-stream',
      'cache-control': 'no-cache',
    })
    .end(readFileSync(p))
})
await new Promise((r) => mock.listen(API, r))
await new Promise((r) => stat.listen(APP, r))

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const OUT = process.argv[3] ?? 'shots-out'
import { mkdirSync } from 'node:fs'
mkdirSync(OUT, { recursive: true })
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--no-first-run'] })
const clickText = (page, sel, t) => page.evaluate((s, x) => { const el = [...document.querySelectorAll(s)].find((e) => e.textContent.trim() === x); el?.click(); return !!el }, sel, t)
const routes = ['', 'workflows', 'queue', 'gallery', 'settings']
for (const [w, h] of [[360, 760], [390, 844], [820, 1180]]) {
  for (const theme of ['dark', 'light']) {
    const ctx = await browser.createBrowserContext() // fresh storage: every run starts at the age gate
    const page = await ctx.newPage()
    await page.setViewport({ width: w, height: h, isMobile: w < 700, hasTouch: w < 700, deviceScaleFactor: 2 })
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: theme }])
    await page.goto(`http://localhost:${APP}/`, { waitUntil: 'networkidle0' })
    await page.evaluate((t) => { document.documentElement.dataset.theme = t }, theme)
    await page.screenshot({ path: `${OUT}/gate-${w}-${theme}.png` })
    for (const c of await page.$$('input[type=checkbox]')) await c.click()
    await clickText(page, 'button', 'Continue'); await wait(500)
    await page.screenshot({ path: `${OUT}/login-${w}-${theme}.png` })
    await page.type('input[type=password]', 'fake-key-for-shots-0000')
    await clickText(page, 'button', 'Save key'); await wait(800)
    await page.screenshot({ path: `${OUT}/chat-empty-${w}-${theme}.png` })
    await page.goto(`http://localhost:${APP}/#/workflows`, { waitUntil: 'networkidle0' }); await wait(400)
    await page.screenshot({ path: `${OUT}/workflows-${w}-${theme}.png` })
    await clickText(page, 'button', 'Use'); await wait(400)
    await page.type('textarea', 'a lighthouse on a stormy sea at dusk')
    await clickText(page, 'button', 'Send')
    await page.waitForSelector('button.thumb', { timeout: 15000 }).catch(() => {}); await wait(600)
    await page.screenshot({ path: `${OUT}/chat-result-${w}-${theme}.png` })
    for (const r of routes.slice(2)) {
      await page.goto(`http://localhost:${APP}/#/${r}`, { waitUntil: 'networkidle0' }); await wait(400)
      await page.screenshot({ path: `${OUT}/${r}-${w}-${theme}.png` })
    }
    await ctx.close()
  }
}
await browser.close(); mock.close(); stat.close()
console.log('done')
