// Drives headless Chrome against the production preview to check the PWA behaviour that matters:
// the service worker registers, only the app shell is cached, media/API/cross-origin responses are not,
// and the app shell still loads offline.
import puppeteer from 'puppeteer-core'

const URL = 'http://localhost:5181/'
const browser = await puppeteer.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  headless: true,
  args: ['--no-first-run'],
})
const page = await browser.newPage()
await page.setViewport({ width: 375, height: 812, isMobile: true })
const out = {}

await page.goto(URL, { waitUntil: 'networkidle0' })
await page.evaluate(() => localStorage.setItem('flotsam.apiKey', 'test-key-1234'))
await page.reload({ waitUntil: 'networkidle0' })

out.registered = await page.evaluate(async () => {
  const reg = await navigator.serviceWorker.ready
  return { scope: reg.scope, state: reg.active?.state }
})
// make sure the SW controls the page (first load is uncontrolled until claim/reload)
await page.reload({ waitUntil: 'networkidle0' })
out.controlled = await page.evaluate(() => !!navigator.serviceWorker.controller)

// Requests that must never be cached: API via proxy, cross-origin JSON, an image-like URL, a data: image.
await page.evaluate(async () => {
  const tryFetch = (u) => fetch(u).catch(() => null)
  await tryFetch('/gd/workflows/')
  await tryFetch('https://modeltrends.ai/v1/model/7d01a45e.json')
  await tryFetch('https://piratediffusion1.s3.amazonaws.com/renders2/x/y.png')
  await tryFetch('/definitely-not-an-asset.png')
})
out.caches = await page.evaluate(async () => {
  const res = {}
  for (const k of await caches.keys()) {
    res[k] = (await (await caches.open(k)).keys()).map((r) => r.url.replace(location.origin, ''))
  }
  return res
})
const allCached = Object.values(out.caches).flat()
out.cachedNonShell = allCached.filter(
  (u) =>
    /gd\/|modeltrends|amazonaws|definitely-not|\.(png|jpg|jpeg|webp|mp4|glb)$/.test(u) &&
    !u.startsWith('/icons/') &&
    !u.startsWith('/apple'),
)
out.cachedCount = allCached.length

// Offline: the shell must still load and show the offline banner.
await page.setOfflineMode(true)
await page.reload({ waitUntil: 'domcontentloaded' })
await new Promise((r) => setTimeout(r, 1200))
out.offline = await page.evaluate(() => ({
  title: document.title,
  banner: document.querySelector('.banner.offline')?.innerText ?? null,
  tabs: [...document.querySelectorAll('.tabs a')].map((a) => a.textContent),
  sendDisabled:
    [...document.querySelectorAll('button')].find((b) => b.textContent === 'Send')?.disabled ?? null,
}))
await page.setOfflineMode(false)

// Manifest installability basics, as Chrome sees them.
const client = await page.createCDPSession()
const { installabilityErrors } = await client.send('Page.getInstallabilityErrors')
out.installabilityErrors = installabilityErrors

console.log(JSON.stringify(out, null, 2))
await browser.close()
