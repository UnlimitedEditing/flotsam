// End-to-end check of the PWA against a LOCAL MOCK of the Graydient API (no real key, no real account).
//   VITE_API_BASE=http://localhost:8095/api/v3/ vite build --outDir dist-e2e   (done by the caller)
//   node e2e-pwa.mjs [dist-e2e dir]      (SHOTS=<dir> to save screenshots; needs puppeteer-core, see docs/test-checklist.md)
// Prints one JSON object of results; each key is a checklist item.
import { createServer } from 'node:http'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { extname, join, resolve } from 'node:path'
import puppeteer from 'puppeteer-core'

const DIST = resolve(process.argv[2] ?? 'dist-e2e')
const SHOTS = process.env.SHOTS ?? '.'
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
const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
  args: ['--no-first-run'],
})
const out = {}
const check = (name, ok, detail = '') => (out[name] = { ok: !!ok, ...(detail ? { detail } : {}) })
const text = (page) => page.evaluate(() => document.body.innerText)
const clickText = (page, sel, t) =>
  page.evaluate(
    (s, x) => {
      const el = [...document.querySelectorAll(s)].find((e) => e.textContent.trim() === x)
      el?.click()
      return !!el
    },
    sel,
    t,
  )

async function newPage(width = 390, height = 844) {
  const page = await browser.newPage()
  await page.setViewport({
    width,
    height,
    isMobile: width < 700,
    hasTouch: width < 700,
    deviceScaleFactor: 2,
  })
  return page
}

try {
  const page = await newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  await page.goto(`http://localhost:${APP}/`, { waitUntil: 'networkidle0' })

  // 1. Fresh load: only the gate is shown, and the API has not been touched.
  check(
    'fresh_shows_gate_only',
    /Before you continue/.test(await text(page)) && apiLog.length === 0,
    `apiCalls=${apiLog.length}`,
  )
  const disabledAtStart = await page.evaluate(
    () => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Continue').disabled,
  )
  check('gate_continue_disabled_until_both_ticked', disabledAtStart)
  for (const c of await page.$$('input[type=checkbox]')) await c.click()
  await clickText(page, 'button', 'Continue')
  await wait(500)
  check(
    'gate_then_login',
    /API key/.test(await text(page)) || (await page.$('input[type=password]')) !== null,
  )
  check('no_api_calls_before_key', apiLog.length === 0, `apiCalls=${apiLog.length}`)

  // 2. Login with a FAKE key; workflows load; send a render; media appears blurred.
  await page.type('input[type=password]', 'fake-key-for-e2e-0000')
  await clickText(page, 'button', 'Save key')
  await wait(800)
  check(
    'token_stored_after_login',
    (await page.evaluate(() => localStorage.getItem('flotsam.apiKey'))) === 'fake-key-for-e2e-0000',
  )
  check(
    'requests_carry_bearer',
    apiLog.some((l) => l.includes('/workflows/') && l.endsWith('auth=yes')),
    apiLog.join(' | '),
  )
  await page.screenshot({ path: `${SHOTS}/e2e-1-after-login.png` })
  out._afterLoginText = (await text(page)).slice(0, 300)

  // pick workflow, send, media arrives blurred
  await page.goto(`http://localhost:${APP}/#/workflows`, { waitUntil: 'networkidle0' })
  await clickText(page, 'button', 'Use')
  await wait(500)
  await page.type('textarea', 'a mock prompt')
  await clickText(page, 'button', 'Send')
  await page.waitForSelector('button.thumb', { timeout: 15000 }).catch(() => {})
  await wait(500)
  check(
    'render_result_arrives',
    (await page.$('button.thumb')) !== null,
    apiLog.filter((l) => l.includes('render')).join(' | '),
  )
  check('blur_default_on', await page.evaluate(() => !!document.querySelector('button.thumb.blurred')))
  await page.screenshot({ path: `${SHOTS}/e2e-3-blurred.png` })
  await page.click('button.thumb')
  await wait(300)
  check('reveal_per_image', await page.evaluate(() => !document.querySelector('button.thumb.blurred')))
  await page.reload({ waitUntil: 'networkidle0' })
  await page.goto(`http://localhost:${APP}/#/queue`, { waitUntil: 'networkidle0' })
  await wait(500)
  check(
    'reload_blurs_again',
    await page.evaluate(() => !!document.querySelector('button.thumb.blurred')),
    (await text(page)).slice(0, 120),
  )

  // Settings: toggle blur off -> not blurred; back on.
  await page.goto(`http://localhost:${APP}/#/settings`, { waitUntil: 'networkidle0' })
  const toggleBlur = () =>
    page.evaluate(() => {
      const l = [...document.querySelectorAll('label')].find((x) =>
        x.textContent.includes('Blur media until tapped'),
      )
      l.querySelector('input').click()
    })
  await toggleBlur()
  await page.goto(`http://localhost:${APP}/#/queue`, { waitUntil: 'networkidle0' })
  await wait(400)
  check(
    'blur_toggle_off_shows_media',
    await page.evaluate(() => {
      const t = document.querySelector('button.thumb')
      return !!t && !t.classList.contains('blurred')
    }),
  )
  await page.goto(`http://localhost:${APP}/#/settings`, { waitUntil: 'networkidle0' })
  await toggleBlur()

  // Service worker cache holds only the shell after all that browsing.
  await page.evaluate(async () => (await navigator.serviceWorker.ready, true))
  await page.reload({ waitUntil: 'networkidle0' })
  const caches_ = await page.evaluate(async () => {
    const r = {}
    for (const k of await caches.keys()) r[k] = (await (await caches.open(k)).keys()).map((q) => q.url)
    return r
  })
  const cachedUrls = Object.values(caches_).flat()
  const bad = cachedUrls.filter((u) => /localhost:8095|img\.png|\/api\//.test(u))
  check(
    'sw_cache_has_no_media_or_api',
    cachedUrls.length > 0 && bad.length === 0,
    `entries=${cachedUrls.length} bad=${JSON.stringify(bad)} cacheNames=${Object.keys(caches_)}`,
  )
  const storage = await page.evaluate(() => ({
    ls: Object.keys(localStorage),
    ss: Object.keys(sessionStorage),
  }))
  out._storageKeys = storage

  // Token survives a reload, and an "app restart" (new page in the same profile).
  const page2 = await newPage()
  await page2.goto(`http://localhost:${APP}/`, { waitUntil: 'networkidle0' })
  check(
    'token_survives_restart',
    (await page2.evaluate(() => localStorage.getItem('flotsam.apiKey'))) === 'fake-key-for-e2e-0000' &&
      !/API key/.test(await text(page2)),
  )
  await page2.close()

  // Offline launch.
  await page.setOfflineMode(true)
  await page.goto(`http://localhost:${APP}/`, { waitUntil: 'domcontentloaded' })
  await wait(1500)
  const off = await page.evaluate(() => ({
    banner: document.querySelector('.banner.offline')?.innerText ?? null,
    sendDisabled:
      [...document.querySelectorAll('button')].find((b) => b.textContent === 'Send')?.disabled ?? null,
  }))
  check('offline_launch_shows_offline_state', !!off.banner && off.sendDisabled !== false, JSON.stringify(off))
  await page.screenshot({ path: `${SHOTS}/e2e-4-offline.png` })
  await page.setOfflineMode(false)

  // Small screen and tablet: no horizontal scroll on any screen while signed in.
  for (const [label, w, h] of [
    ['320px', 320, 640],
    ['tablet', 820, 1180],
  ]) {
    const p = await newPage(w, h)
    const overflowing = []
    for (const route of ['', 'workflows', 'queue', 'gallery', 'settings']) {
      await p.goto(`http://localhost:${APP}/#/${route}`, { waitUntil: 'networkidle0' })
      await wait(300)
      if (await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth))
        overflowing.push(route || 'chat')
    }
    check(`no_horizontal_scroll_${label}`, overflowing.length === 0, overflowing.join(','))
    await p.close()
  }

  // Sign out wipes the key; clear-data wipes everything and returns to the gate.
  await page.goto(`http://localhost:${APP}/#/settings`, { waitUntil: 'networkidle0' })
  await clickText(page, 'button', 'Sign out')
  await wait(500)
  check(
    'sign_out_removes_token',
    (await page.evaluate(() => localStorage.getItem('flotsam.apiKey'))) === null,
  )
  await page.evaluate(() => localStorage.setItem('flotsam.apiKey', 'fake-key-for-e2e-0000'))
  await page.reload({ waitUntil: 'networkidle0' })
  await page.goto(`http://localhost:${APP}/#/settings`, { waitUntil: 'networkidle0' })
  await clickText(page, 'button', 'Clear all data on this device')
  await clickText(page, 'button', 'Yes, clear everything')
  await wait(1500)
  const after = await page.evaluate(async () => ({
    ls: Object.keys(localStorage),
    idb: (await indexedDB.databases?.())?.map((d) => d.name) ?? [],
  }))
  const gateBack = /Before you continue/.test(await text(page))
  check(
    'clear_data_wipes_and_returns_to_gate',
    gateBack && !after.ls.includes('flotsam.apiKey'),
    JSON.stringify(after),
  )
  out._afterClickClear = (await text(page)).slice(-200)
  await page.screenshot({ path: `${SHOTS}/e2e-5-clear.png` })
  await page.close()
  out._pageErrors = errors
  await browser.close()
} catch (e) {
  out._error = String(e?.stack ?? e)
  try {
    await browser.close()
  } catch {}
}
mock.close()
stat.close()
console.log(JSON.stringify(out, null, 2))
if (out._error || Object.values(out).some((v) => v && v.ok === false)) process.exitCode = 1
