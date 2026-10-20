import { useSyncExternalStore } from 'react'
import { registerBootstrap } from '../state/bootstrap'
import { isNative } from './platform'
import { FlotsamNative } from './plugin'
import { initialUpdateView, updateReducer, type UpdateAction, type UpdateView } from './updateState'

// Side effects for the self-update flow (Android only). State lives in one shared store so Settings, the
// forced-update screen and the launch banner always agree.

let view: UpdateView = initialUpdateView
const listeners = new Set<() => void>()

function dispatch(a: UpdateAction): void {
  view = updateReducer(view, a)
  listeners.forEach((l) => l())
}

const subscribe = (cb: () => void) => (listeners.add(cb), () => listeners.delete(cb))
export const useAppUpdate = (): UpdateView => useSyncExternalStore(subscribe, () => view)
export const getUpdateView = (): UpdateView => view

/** Loads the cached decision (no network) so a forced update can block before anything else renders. */
export const updateReady: Promise<void> = isNative()
  ? FlotsamNative.updateStatus()
      .then((info) => dispatch({ type: 'status', info }))
      .catch(() => {})
  : Promise.resolve()
registerBootstrap(updateReady)

let listening = false
function listen(): void {
  if (listening) return
  listening = true
  void FlotsamNative.addListener('updateProgress', (e) =>
    dispatch({ type: 'progress', done: e.done, total: e.total }),
  )
  void FlotsamNative.addListener('updateFailed', (e) => dispatch({ type: 'failed', message: e.message }))
}

/** `auto` respects the once-a-day limit (used at launch); a manual check always asks. */
export async function checkForUpdate(auto = false): Promise<void> {
  if (!isNative()) return
  listen()
  if (!auto) dispatch({ type: 'checking' })
  try {
    dispatch({ type: 'checked', info: await FlotsamNative.updateCheck({ auto }) })
  } catch (e) {
    dispatch({ type: 'failed', message: (e as Error).message })
  }
}

/** Download (verified natively), then hand to Android's installer. */
export async function startUpdate(): Promise<void> {
  if (!isNative()) return
  listen()
  dispatch({ type: 'downloading' })
  try {
    await FlotsamNative.updateDownload()
    dispatch({ type: 'ready' })
    await installVerified()
  } catch (e) {
    dispatch({ type: 'failed', message: (e as Error).message })
  }
}

/** Installs the already-downloaded, verified file (after the user allowed installs from this app). */
export async function installVerified(): Promise<void> {
  try {
    const r = await FlotsamNative.updateInstall()
    dispatch(r.needsPermission ? { type: 'needsPermission' } : { type: 'installing' })
  } catch (e) {
    dispatch({ type: 'failed', message: (e as Error).message })
  }
}

export const openInstallSettings = (): Promise<void> => FlotsamNative.updateOpenInstallSettings()
