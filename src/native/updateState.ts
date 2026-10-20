import type { NativeUpdateDecision, NativeUpdateState } from './plugin'

// The self-update flow as a pure state machine (the side effects live in updater.ts), so every transition
// can be tested without a phone.

export type UpdatePhase =
  'idle' | 'checking' | 'downloading' | 'verifying' | 'ready' | 'needsPermission' | 'installing' | 'error'

export interface UpdateView {
  loaded: boolean
  enabled: boolean
  installedName: string
  installedCode: number
  decision: NativeUpdateDecision
  manifest?: NativeUpdateState['manifest']
  lastCheck: number
  phase: UpdatePhase
  progress: { done: number; total: number } | null
  error: string
}

export const initialUpdateView: UpdateView = {
  loaded: false,
  enabled: false,
  installedName: '',
  installedCode: 0,
  decision: 'none',
  lastCheck: 0,
  phase: 'idle',
  progress: null,
  error: '',
}

export type UpdateAction =
  | { type: 'status'; info: NativeUpdateState }
  | { type: 'checking' }
  | { type: 'checked'; info: NativeUpdateState }
  | { type: 'downloading' }
  | { type: 'progress'; done: number; total: number }
  | { type: 'ready' }
  | { type: 'needsPermission' }
  | { type: 'installing' }
  | { type: 'failed'; message: string }

function withInfo(s: UpdateView, info: NativeUpdateState): UpdateView {
  return {
    ...s,
    loaded: true,
    enabled: info.enabled,
    installedName: info.installedName,
    installedCode: info.installedCode,
    decision: info.decision,
    manifest: info.manifest,
    lastCheck: info.lastCheck,
  }
}

export function updateReducer(s: UpdateView, a: UpdateAction): UpdateView {
  switch (a.type) {
    case 'status':
      return withInfo(s, a.info)
    case 'checking':
      return { ...s, phase: 'checking', error: '' }
    case 'checked':
      // A failed check keeps the cached decision (a forced update must still block offline) and shows why.
      return { ...withInfo(s, a.info), phase: a.info.error ? 'error' : 'idle', error: a.info.error }
    case 'downloading':
      return { ...s, phase: 'downloading', progress: { done: 0, total: 0 }, error: '' }
    case 'progress': {
      const complete = a.total > 0 && a.done >= a.total
      return {
        ...s,
        phase: complete ? 'verifying' : 'downloading',
        progress: { done: a.done, total: a.total },
      }
    }
    case 'ready':
      return { ...s, phase: 'ready', progress: null }
    case 'needsPermission':
      return { ...s, phase: 'needsPermission', progress: null }
    case 'installing':
      return { ...s, phase: 'installing', progress: null }
    case 'failed':
      return { ...s, phase: 'error', progress: null, error: a.message }
  }
}

export const isForced = (s: UpdateView): boolean => s.enabled && s.decision === 'forced'
export const isUpdateAvailable = (s: UpdateView): boolean =>
  s.enabled && (s.decision === 'available' || s.decision === 'forced')
export const isBusy = (s: UpdateView): boolean =>
  ['checking', 'downloading', 'verifying', 'installing'].includes(s.phase)

export function describeProgress(p: { done: number; total: number } | null): string {
  if (!p) return ''
  const mb = (n: number) => (n / 1_048_576).toFixed(1)
  return p.total > 0 ? `${mb(p.done)} of ${mb(p.total)} MB` : `${mb(p.done)} MB`
}

/** Which top-level screen to show. Order matters: a forced update outranks the lock, the age gate and key entry. */
export function pickScreen(i: {
  ready: boolean
  forcedUpdate: boolean
  locked: boolean
  consented: boolean
  signedIn: boolean
}): 'blank' | 'update' | 'lock' | 'gate' | 'login' | 'app' {
  if (!i.ready) return 'blank'
  if (i.forcedUpdate) return 'update'
  if (i.locked) return 'lock'
  if (!i.consented) return 'gate'
  if (!i.signedIn) return 'login'
  return 'app'
}
