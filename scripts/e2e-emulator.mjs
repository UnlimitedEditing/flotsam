// Drives the installed DEBUG build of the Android app over WebView DevTools on an emulator (fake key only).
// Needs ANDROID_HOME, one running emulator and Node 22+. Usage: SHOTS=dir node scripts/e2e-emulator.mjs
import { execFileSync } from 'node:child_process'
const ADB = process.env.ANDROID_HOME.split('\\').join('/') + '/platform-tools/adb.exe'
const adb = (...a) =>
  execFileSync(ADB, a, { encoding: 'utf8', env: { ...process.env, MSYS_NO_PATHCONV: '1' } }).trim()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const SHOTS = process.env.SHOTS ?? 'shots'
const TAG = process.env.TAG ?? 'emu'
const out = {}
const check = (n, ok, d = '') => (out[n] = { ok: !!ok, ...(d ? { detail: d } : {}) })

async function connect() {
  const sock = adb('shell', 'cat', '/proc/net/unix')
    .match(/webview_devtools_remote_\d+/g)
    ?.pop()
  adb('forward', 'tcp:9222', `localabstract:${sock}`)
  let tgt
  for (let i = 0; i < 20 && !tgt; i++) {
    try {
      tgt = (await (await fetch('http://localhost:9222/json')).json()).find((t) => t.type === 'page')
    } catch {}
    if (!tgt) await wait(1000)
  }
  const ws = new WebSocket(tgt.webSocketDebuggerUrl)
  await new Promise((r, j) => ((ws.onopen = r), (ws.onerror = j)))
  let id = 0
  const pending = new Map()
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data)
    if (d.id && pending.has(d.id)) {
      pending.get(d.id)(d)
      pending.delete(d.id)
    }
  }
  const send = (method, params = {}) =>
    new Promise((res) => {
      const i = ++id
      pending.set(i, res)
      ws.send(JSON.stringify({ id: i, method, params }))
    })
  const page = {
    async evaluate(fn, ...args) {
      const expr = `(${fn.toString()}).apply(null, ${JSON.stringify(args)})`
      const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })
      if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300))
      return r.result?.result?.value
    },
    async has(sel) {
      return page.evaluate((s) => !!document.querySelector(s), sel)
    },
    async clickAll(sel) {
      return page.evaluate((s) => document.querySelectorAll(s).forEach((e) => e.click()), sel)
    },
    async type(sel, v) {
      return page.evaluate(
        (s, x) => {
          const el = document.querySelector(s)
          const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
          set.call(el, x)
          el.dispatchEvent(new Event('input', { bubbles: true }))
        },
        sel,
        v,
      )
    },
    async shot(file) {
      const r = await send('Page.captureScreenshot', { format: 'png' })
      const { writeFileSync } = await import('node:fs')
      writeFileSync(file, Buffer.from(r.result.data, 'base64'))
    },
  }
  for (let i = 0; i < 40; i++) {
    if (
      await page
        .evaluate(
          () => document.getElementById('root') && document.getElementById('root').children.length > 0,
        )
        .catch(() => false)
    )
      break
    await wait(1000)
  }
  await wait(500)
  const b = { disconnect: async () => ws.close() }
  return { b, page }
}
const text = (p) => p.evaluate(() => document.body.innerText)
const clickText = (p, sel, t) =>
  p.evaluate(
    (s, x) => {
      const e = [...document.querySelectorAll(s)].find((y) => y.textContent.trim() === x)
      e && e.click()
      return !!e
    },
    sel,
    t,
  )
const launch = () => {
  adb('shell', 'am', 'force-stop', 'app.flotsam.client')
  adb('shell', 'monkey', '-p', 'app.flotsam.client', '-c', 'android.intent.category.LAUNCHER', '1')
}

try {
  adb('shell', 'pm', 'clear', 'app.flotsam.client')
  launch()
  await wait(7000)
  let { b, page } = await connect()
  const sdk = adb('shell', 'getprop', 'ro.build.version.sdk')
  out._sdk = sdk
  check('fresh_shows_gate', /Before you continue/.test(await text(page)), (await text(page)).slice(0, 60))
  await page.clickAll('input[type=checkbox]')
  await clickText(page, 'button', 'Continue')
  await wait(800)
  check('gate_then_login', await page.has('input[type=password]'))
  await page.type('input[type=password]', 'fake-key-for-emulator-0000')
  await clickText(page, 'button', 'Save key')
  await wait(1500)
  check('login_accepts_key', !(await page.has('input[type=password]')))
  const ls = await page.evaluate(() => Object.keys(localStorage))
  check('key_not_in_webview_localstorage', !ls.includes('flotsam.apiKey'), JSON.stringify(ls))
  await page.shot(`${SHOTS}/${TAG}-1-main.png`)
  await b.disconnect()

  // Restart: key survives (Keystore), gate not shown again.
  launch()
  await wait(7000)
  ;({ b, page } = await connect())
  const t = await text(page)
  check('key_survives_restart', !/API key/.test(t) && !/Before you continue/.test(t), t.slice(0, 80))
  const layout = await page.evaluate(() => ({ w: innerWidth, sw: document.documentElement.scrollWidth }))
  check('no_horizontal_scroll', layout.sw <= layout.w, JSON.stringify(layout))

  // Back button leaves the app from the home screen.
  adb('shell', 'input', 'keyevent', 'KEYCODE_BACK')
  await wait(1500)
  const top =
    adb('shell', 'dumpsys', 'activity', 'activities')
      .split('\n')
      .find((l) => /topResumedActivity|mResumedActivity/.test(l)) ?? ''
  check('back_leaves_app', !/app\.flotsam\.client/.test(top), top.trim())
  launch()
  await wait(6000)
  ;({ b, page } = await connect())

  // Offline launch.
  adb('shell', 'svc', 'wifi', 'disable')
  adb('shell', 'svc', 'data', 'disable')
  adb('shell', 'cmd', 'connectivity', 'airplane-mode', 'enable')
  await wait(3000)
  launch()
  await wait(7000)
  ;({ b, page } = await connect())
  const ot = await text(page)
  check('offline_launch_shows_offline', /offline/i.test(ot), ot.slice(0, 120))
  adb('shell', 'cmd', 'connectivity', 'airplane-mode', 'disable')
  adb('shell', 'svc', 'wifi', 'enable')
  adb('shell', 'svc', 'data', 'enable')
  await b.disconnect()

  // Sign out then clear all data.
  launch()
  await wait(7000)
  ;({ b, page } = await connect())
  await page.evaluate(() => (location.hash = '#/settings'))
  await wait(800)
  await clickText(page, 'button', 'Sign out')
  await wait(1000)
  check('sign_out_returns_to_login', await page.has('input[type=password]'))
  await b.disconnect()
  launch()
  await wait(7000)
  ;({ b, page } = await connect())
  check('signed_out_state_survives_restart', await page.has('input[type=password]'))
  await page.type('input[type=password]', 'fake-key-for-emulator-0000')
  await clickText(page, 'button', 'Save key')
  await wait(1000)
  await page.evaluate(() => (location.hash = '#/settings'))
  await wait(800)
  await clickText(page, 'button', 'Clear all data on this device')
  await wait(300)
  await clickText(page, 'button', 'Yes, clear everything')
  await wait(3000)
  ;({ b, page } = await connect().catch(() => ({ b, page })))
  check('clear_data_returns_to_gate', /Before you continue/.test(await text(page)))
  await b.disconnect()
} catch (e) {
  out._error = String(e?.stack ?? e)
}
console.log(JSON.stringify(out, null, 2))
