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
// Real Rig Studio files make the viewer checks meaningful; without them those checks are skipped.
const SAMPLE_PUPPET =
  process.env.RIG_SAMPLE_PUPPET ?? 'D:/rig-studio/samples/puppet/bluebob2/bluebob2.rig.png'
const SAMPLE_SHEET = process.env.RIG_SAMPLE_SHEET ?? 'D:/rig-studio/bench/real1.sheet.png'
const puppetFile = existsSync(SAMPLE_PUPPET) ? readFileSync(SAMPLE_PUPPET) : null
const sheetFile = existsSync(SAMPLE_SHEET) ? readFileSync(SAMPLE_SHEET) : null
const apiLog = []
const renderPrompts = [] // every render command the app sent
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
const partsWorkflow = {
  ...workflow,
  id: '4',
  attributes: { ...workflow.attributes, slug: 'rig-puppet-parts', name: 'rig-puppet-parts' },
}
const packWorkflow = {
  ...workflow,
  id: '5',
  attributes: { ...workflow.attributes, slug: 'rig-puppet-pack', name: 'rig-puppet-pack' },
}
const rigWorkflow = {
  ...workflow,
  id: '2',
  attributes: { ...workflow.attributes, slug: 'rig-direct', name: 'rig-direct' },
}
const puppetWorkflow = {
  ...workflow,
  id: '3',
  attributes: { ...workflow.attributes, slug: 'rig-puppet', name: 'rig-puppet' },
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
  if (url.pathname === '/puppet.png' && puppetFile)
    return res.writeHead(200, { ...cors, 'content-type': 'image/png' }).end(puppetFile)
  if (url.pathname === '/sheet.png' && sheetFile)
    return res.writeHead(200, { ...cors, 'content-type': 'image/png' }).end(sheetFile)
  if (url.pathname.endsWith('/workflows/'))
    return res
      .writeHead(200, { ...cors, 'content-type': 'application/json' })
      .end(
        JSON.stringify({
          data: [workflow, rigWorkflow, puppetWorkflow, partsWorkflow, packWorkflow],
          links: {},
        }),
      )
  const imagesFor = (kind) => {
    const file =
      kind === 'puppet' && puppetFile ? 'puppet.png' : kind === 'sheet' && sheetFile ? 'sheet.png' : 'img.png'
    const u = `http://localhost:${API}/${file}`
    return [{ url: u, media: [{ url: u, media_type: 'image/png' }] }]
  }
  if (req.method === 'POST' && url.pathname.endsWith('/render/')) {
    let body = ''
    req.on('data', (c) => (body += c))
    req.on('end', () => {
      let prompt = ''
      try {
        prompt = JSON.parse(body).prompt ?? ''
      } catch {
        /* not JSON */
      }
      renderPrompts.push(prompt)
      const kind = prompt.includes('rig-puppet-parts')
        ? 'plain' // a part sheet is an ordinary picture
        : prompt.includes('rig-puppet')
          ? 'puppet' // the packing step (and the plain rig-puppet workflow) return a finished puppet
          : prompt.includes('rig-direct')
            ? 'sheet'
            : 'plain'
      const hash = `mockhash-${kind}`
      res.writeHead(200, { ...cors, 'content-type': 'text/event-stream' })
      const sse = (event, data) => `data: ${JSON.stringify({ event, data })}\n\n`
      res.write(sse('render_queued', { render_hash: hash, estimated_render_time: 1 }))
      setTimeout(() => {
        res.write(sse('rendering_started', {}))
        res.write(sse('rendering_done', { render_hash: hash, images: imagesFor(kind) }))
        res.end()
      }, 300)
    })
    return
  }
  const m = url.pathname.match(/\/render\/mockhash-(plain|sheet|puppet)/)
  if (m)
    return res
      .writeHead(200, { ...cors, 'content-type': 'application/json' })
      .end(JSON.stringify({ data: { attributes: { images: imagesFor(m[1]), status: 'done' } } }))
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
  check(
    'no_m3ds_button_on_plain_result',
    await page.evaluate(
      () => ![...document.querySelectorAll('button')].some((b) => /M3DS|View result/.test(b.textContent)),
    ),
  )
  check('blur_default_on', await page.evaluate(() => !!document.querySelector('button.thumb.blurred')))
  await page.screenshot({ path: `${SHOTS}/e2e-3-blurred.png` })
  await page.click('button.thumb')
  await wait(300)
  check('reveal_per_image', await page.evaluate(() => !document.querySelector('button.thumb.blurred')))

  // Lightbox: opens from the revealed thumbnail, drag-to-dismiss closes it, a short drag springs back.
  await page.click('button.thumb')
  await page.waitForSelector('.lightbox .lb-media img', { timeout: 5000 }).catch(() => {})
  await wait(450)
  check('lightbox_opens', (await page.$('.lightbox')) !== null)
  check(
    'lightbox_covers_the_tab_bar',
    await page.evaluate(() => {
      const el = document.elementFromPoint(innerWidth / 2, innerHeight - 8)
      return !!el && !!el.closest('.lightbox')
    }),
  )
  await page.screenshot({ path: `${SHOTS}/e2e-3b-lightbox.png` })
  const box = await (await page.$('.lb-media img'))?.boundingBox()
  const cx = (box?.x ?? 100) + (box?.width ?? 10) / 2
  const cy = (box?.y ?? 100) + (box?.height ?? 10) / 2
  const dragBy = async (dy) => {
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    for (let k = 1; k <= 8; k++) await page.mouse.move(cx, cy + (dy * k) / 8)
    await page.mouse.up()
    await wait(500)
  }
  await dragBy(40)
  check('lightbox_short_drag_springs_back', (await page.$('.lightbox')) !== null)
  await dragBy(240)
  check(
    'lightbox_drag_dismisses',
    (await page.$('.lightbox')) === null,
    await page.evaluate(() => document.querySelector('.lightbox')?.getAttribute('style') ?? 'closed'),
  )
  // A declared (barcoded) workflow gets "View result"; an advanced setting adds the manual button to plain results.
  await page.goto(`http://localhost:${APP}/#/workflows`, { waitUntil: 'networkidle0' })
  await wait(400)
  await page.evaluate(() => {
    const use = [...document.querySelectorAll('button')].find(
      (b) => b.textContent.trim() === 'Use' && b.closest('li')?.textContent.includes('rig-direct'),
    )
    use?.click()
  })
  await wait(400)
  await page.type('textarea', 'a barcoded mock')
  await clickText(page, 'button', 'Send')
  await page.waitForSelector('.view-result', { timeout: 15000 }).catch(() => {})
  check('declared_workflow_shows_view_result', (await page.$('.view-result')) !== null)
  const viewLabels = () =>
    page.evaluate(() => [...document.querySelectorAll('.view-result')].map((b) => b.textContent.trim()))
  check(
    'viewer_button_is_named_for_the_result',
    (await viewLabels()).includes('Open direction sheet'),
    (await viewLabels()).join(' | '),
  )

  // Real files: the direction sheet opens as readable lines; the puppet opens, moves, and answers its controls.
  const closePanel = async () => {
    await page.evaluate(() => {
      const bar = document.querySelector('.result-panel .lb-bar')
      ;[...(bar?.querySelectorAll('button') ?? [])].find((b) => b.textContent.trim() === 'Close')?.click()
    })
    await wait(300)
  }
  if (sheetFile) {
    await clickText(page, '.view-result', 'Open direction sheet')
    await page.waitForSelector('.dir-line', { timeout: 20000 }).catch(() => {})
    const lines = await page.$$eval('.dir-line', (n) => n.length)
    check('direction_sheet_opens_as_lines', lines > 5, `lines=${lines}`)
    await page.screenshot({ path: `${SHOTS}/e2e-3c-direction.png` })
    await closePanel()
  } else check('direction_sheet_opens_as_lines', true, 'skipped: no sample sheet')

  if (puppetFile) {
    await page.goto(`http://localhost:${APP}/#/workflows`, { waitUntil: 'networkidle0' })
    await wait(400)
    await page.evaluate(() => {
      const use = [...document.querySelectorAll('button')].find(
        (b) => b.textContent.trim() === 'Use' && b.closest('li')?.textContent.includes('rig-puppet'),
      )
      use?.click()
    })
    await wait(400)
    await page.type('textarea', 'a puppet mock')
    await clickText(page, 'button', 'Send')
    await page
      .waitForFunction(
        () =>
          [...document.querySelectorAll('.view-result')].some((b) => b.textContent.trim() === 'Open puppet'),
        { timeout: 15000 },
      )
      .catch(() => {})
    check(
      'puppet_button_named',
      (await viewLabels()).includes('Open puppet'),
      (await viewLabels()).join(' | '),
    )
    await clickText(page, '.view-result', 'Open puppet')
    await page.waitForSelector('.puppet-stage canvas', { timeout: 20000 }).catch(() => {})
    await wait(1500)
    const frame = () =>
      page.evaluate(() => {
        const cv = document.querySelector('.puppet-stage canvas')
        if (!cv) return null
        const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data
        let opaque = 0
        let sum = 0
        for (let i = 3; i < d.length; i += 4 * 97) {
          if (d[i] > 20) opaque++
          sum = (sum * 31 + d[i - 3] + d[i - 2] * 3 + d[i - 1] * 7 + d[i]) % 1000003
        }
        return { opaque, sum, w: cv.width, h: cv.height }
      })
    const chip = (group, label) =>
      page.evaluate(
        (g, l) => {
          const row = document.querySelector(`[role=group][aria-label="${g}"]`)
          ;[...(row?.querySelectorAll('button') ?? [])].find((b) => b.textContent.trim() === l)?.click()
        },
        group,
        label,
      )
    const f0 = await frame()
    check('puppet_opens_and_draws', !!f0 && f0.opaque > 200, JSON.stringify(f0))
    await page.screenshot({ path: `${SHOTS}/e2e-3d-puppet.png` })
    await chip('Mouth', 'A')
    await wait(250)
    const fa = await frame()
    await chip('Mouth', 'D')
    await wait(250)
    const fd = await frame()
    check(
      'puppet_mouth_control_changes_the_picture',
      !!fa && !!fd && fa.sum !== fd.sum,
      `A=${fa?.sum} D=${fd?.sum}`,
    )
    await chip('Brows', 'up3')
    await wait(250)
    const fb = await frame()
    check(
      'puppet_brows_control_changes_the_picture',
      !!fb && !!fd && fb.sum !== fd.sum,
      `D=${fd?.sum} up3=${fb?.sum}`,
    )
    await page.evaluate(() => {
      const l = [...document.querySelectorAll('label')].find((x) => x.textContent.includes('Show regions'))
      l?.querySelector('input')?.click()
    })
    await wait(250)
    const fr = await frame()
    check('puppet_regions_overlay_draws', !!fr && !!fb && fr.sum !== fb.sum)
    // the explicit keep-it action
    await page.evaluate(() => {
      const bar = document.querySelector('.result-panel .lb-bar')
      ;[...(bar?.querySelectorAll('button') ?? [])]
        .find((b) => b.textContent.trim() === 'Add to library')
        ?.click()
    })
    await wait(800)
    check(
      'add_puppet_to_library',
      await page.evaluate(() =>
        [...document.querySelectorAll('.result-panel .lb-bar button')].some(
          (b) => b.textContent.trim() === 'In your library',
        ),
      ),
    )
    await closePanel()
  } else {
    for (const n of [
      'puppet_button_named',
      'puppet_opens_and_draws',
      'puppet_mouth_control_changes_the_picture',
      'puppet_brows_control_changes_the_picture',
      'puppet_regions_overlay_draws',
    ])
      check(n, true, 'skipped: no sample puppet')
  }
  // Library: save an image from the lightbox, list both items, open, rename, delete, and survive a reload.
  await page.goto(`http://localhost:${APP}/#/gallery`, { waitUntil: 'networkidle0' })
  await wait(400)
  await page.click('button.thumb') // reveals (media is blurred by default)
  await wait(300)
  await page.click('button.thumb') // opens
  await page.waitForSelector('.lightbox .lb-bar', { timeout: 5000 }).catch(() => {})
  await page.evaluate(() => {
    const bar = document.querySelector('.lightbox .lb-bar')
    ;[...(bar?.querySelectorAll('button') ?? [])]
      .find((x) => x.textContent.trim() === 'Save to library')
      ?.click()
  })
  await wait(900)
  check(
    'lightbox_saves_image_to_library',
    await page.evaluate(() => /Saved to library/.test(document.querySelector('.toast')?.textContent ?? '')),
  )
  await page.evaluate(() => {
    const bar = document.querySelector('.lightbox .lb-bar')
    ;[...(bar?.querySelectorAll('button') ?? [])].find((x) => x.textContent.trim() === 'Close')?.click()
  })
  await wait(300)
  const expectedItems = puppetFile ? 2 : 1
  await page.goto(`http://localhost:${APP}/#/gallery?tab=library`, { waitUntil: 'networkidle0' })
  await wait(600)
  const cards = () => page.$$eval('.lib-card', (n) => n.length)
  check('library_lists_saved_items', (await cards()) === expectedItems, `cards=${await cards()}`)
  await page.screenshot({ path: `${SHOTS}/e2e-3e-library.png` })
  if (puppetFile) {
    const hasThumb = await page.evaluate(() =>
      [...document.querySelectorAll('.lib-card')].some(
        (c) => c.textContent.includes('bluebob2') && !!c.querySelector('img'),
      ),
    )
    check('library_puppet_has_thumbnail_and_name', hasThumb)
    const tapCard = (name) =>
      page.evaluate((n) => {
        const c = [...document.querySelectorAll('.lib-card')].find((x) => x.textContent.includes(n))
        c?.querySelector('.lib-open')?.click()
      }, name)
    await tapCard('bluebob2') // reveal
    await wait(300)
    await tapCard('bluebob2') // open
    await page.waitForSelector('.puppet-stage canvas', { timeout: 20000 }).catch(() => {})
    await wait(800)
    check('library_puppet_opens_from_storage', (await page.$('.puppet-stage canvas')) !== null)
    await closePanel()
    await page.evaluate(() => {
      const c = [...document.querySelectorAll('.lib-card')].find((x) => x.textContent.includes('bluebob2'))
      ;[...(c?.querySelectorAll('button') ?? [])].find((b) => b.textContent.trim() === 'Rename')?.click()
    })
    await wait(500)
    await page.evaluate(() => {
      const input = document.querySelector('.sheet input')
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
      set.call(input, 'Bob renamed')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await clickText(page, '.sheet button', 'Save')
    await wait(500)
    check('library_rename', await page.evaluate(() => document.body.innerText.includes('Bob renamed')))
  }
  // survives a reload (it is in IndexedDB, not in memory)
  await page.reload({ waitUntil: 'networkidle0' })
  await page.goto(`http://localhost:${APP}/#/gallery?tab=library`, { waitUntil: 'networkidle0' })
  await wait(600)
  check('library_survives_reload', (await cards()) === expectedItems, `cards=${await cards()}`)
  const idbLib = await page.evaluate(
    () =>
      new Promise((res) => {
        const r = indexedDB.open('keyval-store')
        r.onsuccess = () => {
          const q = r.result.transaction('keyval').objectStore('keyval').getAllKeys()
          q.onsuccess = () => res(q.result.filter((k) => String(k).startsWith('lib:')).length)
        }
        r.onerror = () => res(-1)
      }),
  )
  check('library_is_in_indexeddb', idbLib >= expectedItems + 1, `lib keys=${idbLib}`)
  const cachedLib = await page.evaluate(async () => {
    const urls = []
    for (const k of await caches.keys()) for (const q of await (await caches.open(k)).keys()) urls.push(q.url)
    return urls.filter((u) => /lib:|puppet.png|sheet.png|img.png/.test(u))
  })
  check('library_not_in_cache_storage', cachedLib.length === 0, JSON.stringify(cachedLib))
  // delete one
  await page.evaluate(() => {
    const c = [...document.querySelectorAll('.lib-card')].find((x) => x.textContent.includes('Image '))
    ;[...(c?.querySelectorAll('button') ?? [])].find((b) => b.textContent.trim() === 'Delete')?.click()
  })
  await wait(500)
  await clickText(page, '.sheet button', 'Delete')
  await wait(600)
  check('library_delete', (await cards()) === expectedItems - 1, `cards=${await cards()}`)
  await page.goto(`http://localhost:${APP}/#/settings`, { waitUntil: 'networkidle0' })
  check(
    'settings_shows_library_usage',
    await page.evaluate(() => /Library: \d+ item/.test(document.body.innerText)),
  )

  // Rig builder: pick a head, run the five renders (four sheets, then the pack), reload part-way, open the puppet,
  // keep it in the library.
  if (puppetFile) {
    const promptsBefore = renderPrompts.length
    await page.goto(`http://localhost:${APP}/#/rig/new`, { waitUntil: 'networkidle0' })
    await page.waitForSelector('.rig-builder .grid button.thumb', { timeout: 10000 }).catch(() => {})
    await page.click('.rig-builder .grid button.thumb') // uncover
    await wait(300)
    await page.click('.rig-builder .grid button.thumb') // choose
    await wait(300)
    check('builder_head_chosen', (await page.$('.rig-chosen')) !== null)
    await page.evaluate(() => {
      const input = document.querySelector('input[aria-label="Puppet name"]')
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
      set.call(input, 'E2E Puppet')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    check(
      'builder_start_enabled',
      await page.evaluate(() =>
        [...document.querySelectorAll('button')].some(
          (b) => b.textContent.trim() === 'Start building' && !b.disabled,
        ),
      ),
    )
    await clickText(page, 'button', 'Start building')
    await page.waitForSelector('.build-steps', { timeout: 10000 }).catch(() => {})
    check('builder_shows_five_steps', (await page.$$eval('.build-step', (n) => n.length)) === 5)
    await page.screenshot({ path: `${SHOTS}/e2e-3f-builder-running.png` })
    // leave and come back mid-build: it keeps going (the controller is not tied to the screen)
    await wait(600)
    await page.reload({ waitUntil: 'networkidle0' })
    await page.goto(`http://localhost:${APP}/#/rig/new`, { waitUntil: 'networkidle0' })
    const deadline = Date.now() + 70000
    let finished = false
    while (Date.now() < deadline) {
      const state = await page.evaluate(() => {
        const labels = [...document.querySelectorAll('button')].map((b) => b.textContent.trim())
        return { open: labels.includes('Open puppet'), retry: labels.includes('Retry the failed step') }
      })
      if (state.open) {
        finished = true
        break
      }
      if (state.retry) await clickText(page, 'button', 'Retry the failed step')
      await wait(500)
    }
    check('builder_finishes_after_a_reload', finished)
    const sent = renderPrompts.slice(promptsBefore)
    const slots = sent.filter((p) => p.includes('rig-puppet-parts')).map((p) => p.match(/\/slot1:(\w+)/)?.[1])
    check(
      'builder_sends_four_part_renders_in_order',
      ['mouth', 'idle', 'eyes', 'brows'].every(
        (s, i) => slots.filter((x) => x === s).length >= 1 && slots.indexOf(s) >= i - 0,
      ) &&
        slots.indexOf('mouth') < slots.indexOf('idle') &&
        slots.indexOf('idle') < slots.indexOf('eyes') &&
        slots.indexOf('eyes') < slots.indexOf('brows'),
      slots.join(','),
    )
    check(
      'builder_packs_with_the_four_sheets',
      sent.some(
        (p) =>
          p.includes('/run:rig-puppet-pack') &&
          ['/image1:URL1', '/image2:URL2', '/image3:URL3', '/image4:URL4'].every((t) => p.includes(t)),
      ),
      sent.filter((p) => p.includes('pack')).join(' | '),
    )
    await page.screenshot({ path: `${SHOTS}/e2e-3g-builder-done.png` })
    await clickText(page, 'button', 'Open puppet')
    await page.waitForSelector('.puppet-stage canvas', { timeout: 20000 }).catch(() => {})
    await wait(1200)
    check('builder_result_opens_as_a_puppet', (await page.$('.puppet-stage canvas')) !== null)
    await page.evaluate(() => {
      const bar = document.querySelector('.result-panel .lb-bar')
      ;[...(bar?.querySelectorAll('button') ?? [])]
        .find((b) => b.textContent.trim() === 'Add to library')
        ?.click()
    })
    await wait(900)
    await closePanel()
    await page.goto(`http://localhost:${APP}/#/gallery?tab=library`, { waitUntil: 'networkidle0' })
    await wait(600)
    check(
      'builder_puppet_is_saved_under_its_name',
      await page.evaluate(() => document.body.innerText.includes('E2E Puppet')),
    )
  } else {
    for (const n of [
      'builder_head_chosen',
      'builder_start_enabled',
      'builder_shows_five_steps',
      'builder_finishes_after_a_reload',
      'builder_sends_four_part_renders_in_order',
      'builder_packs_with_the_four_sheets',
      'builder_result_opens_as_a_puppet',
      'builder_puppet_is_saved_under_its_name',
    ])
      check(n, true, 'skipped: no sample puppet')
  }
  await page.goto(`http://localhost:${APP}/#/settings`, { waitUntil: 'networkidle0' })
  await page.evaluate(() => {
    const l = [...document.querySelectorAll('label')].find((x) => x.textContent.includes('Open as M3DS'))
    l?.querySelector('input')?.click()
  })
  await page.goto(`http://localhost:${APP}/#/queue`, { waitUntil: 'networkidle0' })
  await wait(400)
  check(
    'advanced_setting_adds_manual_button_to_plain_result',
    await page.evaluate(() =>
      [...document.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Open as M3DS'),
    ),
  )
  await page.goto(`http://localhost:${APP}/#/settings`, { waitUntil: 'networkidle0' })
  await page.evaluate(() => {
    const l = [...document.querySelectorAll('label')].find((x) => x.textContent.includes('Open as M3DS'))
    l?.querySelector('input')?.click()
  })
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

  // Reduced motion: animations collapse to ~0 and the design tokens follow.
  {
    const rm = await newPage()
    await rm.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }])
    await rm.goto(`http://localhost:${APP}/#/queue`, { waitUntil: 'networkidle0' })
    await wait(300)
    const m = await rm.evaluate(() => ({
      page: getComputedStyle(document.querySelector('.view-page')).animationDuration,
      token: getComputedStyle(document.documentElement).getPropertyValue('--dur-3').trim(),
    }))
    check('reduced_motion_collapses_animation', m.page === '0.001s' && m.token === '1ms', JSON.stringify(m))
    await rm.close()
  }

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
  // Sheet: focus moves into it, Escape closes it after its exit animation, and focus goes back to the button.
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(
      (x) => x.textContent.trim() === 'Clear all data on this device',
    )
    b?.focus()
    b?.click()
  })
  await wait(450)
  check(
    'sheet_opens_with_focus_inside',
    await page.evaluate(() => !!document.activeElement?.closest('.sheet')),
  )
  await page.screenshot({ path: `${SHOTS}/e2e-4b-sheet.png` })
  await page.keyboard.press('Escape')
  await wait(450)
  check(
    'sheet_escape_closes_and_returns_focus',
    await page.evaluate(
      () =>
        !document.querySelector('.sheet') &&
        document.activeElement?.textContent?.trim() === 'Clear all data on this device',
    ),
  )
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
  const libKeysAfter = await page.evaluate(
    () =>
      new Promise((res) => {
        const r = indexedDB.open('keyval-store')
        r.onsuccess = () => {
          if (!r.result.objectStoreNames.contains('keyval')) return res(0)
          const q = r.result.transaction('keyval').objectStore('keyval').getAllKeys()
          q.onsuccess = () => res(q.result.filter((k) => String(k).startsWith('lib:')).length)
        }
        r.onerror = () => res(-1)
      }),
  )
  check('clear_data_empties_the_library', libKeysAfter === 0, `lib keys after wipe=${libKeysAfter}`)
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
