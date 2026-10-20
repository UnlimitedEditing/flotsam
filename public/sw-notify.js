// Imported by the generated service worker (workbox.importScripts).
// Handles taps on the "render ready" notification: focus an open Flotsam window, or open one at the queue.
// Notifications carry no content (no prompt, workflow name or image), only a job id for routing.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    (async () => {
      const target = new URL('./#/queue', self.registration.scope).href
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const w of windows) {
        if ('focus' in w) {
          await w.focus()
          if ('navigate' in w) await w.navigate(target).catch(() => {})
          return
        }
      }
      await self.clients.openWindow(target)
    })(),
  )
})
