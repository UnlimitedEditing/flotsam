// Progressive enhancement only: without JavaScript every section stays open and a plain download link is shown.
import { detectPlatform } from './detect.js'

const platform = detectPlatform(navigator.userAgent, navigator.maxTouchPoints)
document.documentElement.dataset.platform = platform

// Open the section for this device first; the others stay one tap away.
for (const id of ['android', 'ios', 'desktop']) {
  const details = document.querySelector(`#${id} details`)
  if (details) details.open = id === platform
}

// The 18+ declaration comes before the download link has a destination at all.
const gate = document.getElementById('android-gate')
if (gate) {
  gate.hidden = false
  const box = document.getElementById('adult')
  const link = document.getElementById('apk-link')
  box.addEventListener('change', () => {
    if (box.checked) {
      link.setAttribute('href', link.dataset.href)
      link.setAttribute('aria-disabled', 'false')
    } else {
      link.removeAttribute('href')
      link.setAttribute('aria-disabled', 'true')
    }
  })
}
