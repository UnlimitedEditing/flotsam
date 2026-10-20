// Real-Chrome check of the privacy cover and auto-lock when the app goes to the background and returns.
import puppeteer from 'puppeteer-core'

const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: false,
  args: ['--no-first-run', '--window-size=420,860'],
})
const page = await browser.newPage()
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const out = {}

await page.goto('http://localhost:5180/#/', { waitUntil: 'networkidle0' })
await page.evaluate(() => (localStorage.clear(), indexedDB.deleteDatabase('keyval-store')))
await page.reload({ waitUntil: 'networkidle0' })
const click = (txt) =>
  page.evaluate(
    (t) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim() === t)?.click(),
    txt,
  )
const setv = (sel, v, i = 0) =>
  page.evaluate(
    (s, val, idx) => {
      const el = document.querySelectorAll(s)[idx]
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, val)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    },
    sel,
    v,
    i,
  )

await wait(800)
await page.evaluate(() => document.querySelectorAll('input[type=checkbox]').forEach((c) => c.click()))
await click('Continue')
await wait(400)
await setv('input[type=password]', 'k-1234')
await click('Save key')
await wait(800)
await page.evaluate(() => (location.hash = '#/settings'))
await wait(400)
await click('Set a PIN')
await setv('.lock-settings input', '4821', 0)
await setv('.lock-settings input', '4821', 1)
await click('Save')
await wait(1800)
await page.evaluate(() => {
  const s = document.querySelector('.lock-settings select')
  s.value = '0'
  s.dispatchEvent(new Event('change', { bubbles: true }))
})
await wait(200)

// Background the app.
const other = await browser.newPage()
await other.goto('about:blank')
await other.bringToFront()
await wait(800)
out.hiddenState = await page.evaluate(() => ({
  visibility: document.visibilityState,
  cover: !!document.querySelector('.privacy-cover'),
  coverText: document.querySelector('.privacy-cover')?.innerText,
}))

// Come back: with "lock immediately" the lock screen must appear and no app content may remain.
await page.bringToFront()
await wait(800)
out.returned = await page.evaluate(() => ({
  visibility: document.visibilityState,
  cover: !!document.querySelector('.privacy-cover'),
  lockScreen: !!document.querySelector('.lock'),
  appContent: !!document.querySelector('.tabs, .view, .chat'),
}))
console.log(JSON.stringify(out, null, 2))
await browser.close()
