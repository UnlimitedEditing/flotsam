// Stands in for `virtual:pwa-register` in the Android build, which has no service worker.
export function registerSW(): (reloadPage?: boolean) => Promise<void> {
  return async () => {}
}
