import { useSyncExternalStore } from 'react'
import { idbStore } from '../jobs/store'
import type { Overrides } from '../m3ds/registry'

export interface Prefs {
  blurNsfw: boolean // default ON: media is blurred until tapped
  showAdult: boolean // default OFF: adult (is_nsfw) workflows are hidden everywhere
  imageHost: 'none' | 'catbox' // where local photos are uploaded so Graydient can fetch them
  outputOverrides: Overrides // per-workflow result type (M3DS etc.), set by the user
  modelTrendsIds: Record<string, string> // workflow slug -> 8-character ModelTrends model id
  notifyDone: boolean // notify when a render finishes while the app is in the background (off by default)
  iosHintDismissed: boolean // the one-time "Add to Home Screen" hint
  privacyScreen: boolean // cover the UI whenever the app is not in the foreground (app switcher, glances)
  discreet: boolean // neutral name in the UI and in notifications
  lockTimeoutMin: number // PIN lock after this many minutes in the background (0 = immediately, -1 = never)
  catboxUserhash: string // the user's own Catbox account hash (optional; anonymous uploads work)
  theme: 'dark' | 'light'
  favorites: string[] // workflow slugs
  recents: string[] // workflow slugs, newest first
  lastWorkflow?: string
}

export const DEFAULT_PREFS: Prefs = {
  blurNsfw: true,
  showAdult: false,
  imageHost: 'none',
  catboxUserhash: '',
  outputOverrides: {},
  notifyDone: false,
  privacyScreen: true,
  discreet: false,
  lockTimeoutMin: 1,
  iosHintDismissed: false,
  modelTrendsIds: {},
  theme: 'dark',
  favorites: [],
  recents: [],
}
const KEY = 'prefs.v1'

let state: Prefs = DEFAULT_PREFS
const listeners = new Set<() => void>()

function applyTheme(t: Prefs['theme']) {
  if (typeof document === 'undefined') return // unit tests run without a DOM
  document.documentElement.dataset.theme = t
}

export const prefsReady: Promise<void> = idbStore.read<Prefs>(KEY, DEFAULT_PREFS).then((p) => {
  state = { ...DEFAULT_PREFS, ...p }
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
