// Which phone is this? Shared by the page script (site/app.js) and the build, so both agree.
// iPadOS Safari reports itself as a Mac, so a "Macintosh" with a touch screen counts as iOS.
export function detectPlatform(userAgent, touchPoints = 0) {
  const ua = String(userAgent || '')
  if (/android/i.test(ua)) return 'android'
  if (/iphone|ipod|ipad/i.test(ua)) return 'ios'
  if (/macintosh/i.test(ua) && touchPoints > 1) return 'ios'
  return 'desktop'
}
