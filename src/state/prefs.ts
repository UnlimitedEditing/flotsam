import { useSyncExternalStore } from 'react'
import { idbStore } from '../jobs/store'

export interface Prefs {
  blurNsfw: boolean // default ON: media is blurred until tapped
  showAdult: boolean // default OFF: adult (is_nsfw) workflows are hidden everywhere
  imageHost: 'none' | 'catbox' // where local photos are uploaded so Graydient can fetch them
  catboxUserhash: string // the user's own Catbox account hash (optional; anonymous uploads work)
  theme: 'dark' | 'light'
  favorites: string[] // workflow slugs
  recents: string[] // workflow slugs, newest first
  lastWorkflow?: string
}

const DEFAULTS: Prefs = {
  blurNsfw: true,
  showAdult: false,
  imageHost: 'none',
  catboxUserhash: '',
  theme: 'dark',
  favorites: [],
  recents: [],
}
const KEY = 'prefs.v1'

let state: Prefs = DEFAULTS
const listeners = new Set<() => void>()

function applyTheme(t: Prefs['theme']) {
  document.documentElement.dataset.theme = t
}

export const prefsReady: Promise<void> = idbStore.read<Prefs>(KEY, DEFAULTS).then((p) => {
  state = { ...DEFAULTS, ...p }
  applyTheme(state.theme)
  listeners.forEach((l) => l())
})

export function getPrefs(): Prefs {
  return state
}

export function setPrefs(patch: Partial<Prefs>): void {
  state = { ...state, ...patch }
  if (patch.theme) applyTheme(state.theme)
  listeners.forEach((l) => l())
  void idbStore.write(KEY, state)
}

export function toggleFavorite(slug: string): void {
  const has = state.favorites.includes(slug)
  setPrefs({ favorites: has ? state.favorites.filter((s) => s !== slug) : [slug, ...state.favorites] })
}

export function noteRecent(slug: string): void {
  setPrefs({ recents: [slug, ...state.recents.filter((s) => s !== slug)].slice(0, 12), lastWorkflow: slug })
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(
    (cb) => (listeners.add(cb), () => listeners.delete(cb)),
    () => state,
  )
}
