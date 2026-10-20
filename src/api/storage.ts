// Phase 0: plain localStorage, wrapped so a blocked/private-mode browser never throws.
// Phase 4 swaps this for Capacitor Preferences + encrypted storage.
const KEY = 'flotsam.apiKey'

export function getApiKey(): string {
  try {
    return localStorage.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}

export function setApiKey(key: string): void {
  try {
    localStorage.setItem(KEY, key)
  } catch {
    /* storage unavailable */
  }
}

export function clearApiKey(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}
