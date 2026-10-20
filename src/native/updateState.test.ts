import { describe, expect, it } from 'vitest'
import type { NativeUpdateState } from './plugin'
import {
  describeProgress,
  initialUpdateView,
  isBusy,
  isForced,
  isUpdateAvailable,
  pickScreen,
  updateReducer,
  type UpdateAction,
  type UpdateView,
} from './updateState'

const info = (over: Partial<NativeUpdateState> = {}): NativeUpdateState => ({
  enabled: true,
  installedCode: 10,
  installedName: '1.0.0',
  lastCheck: 1000,
  checked: true,
  decision: 'available',
  error: '',
  manifest: { versionCode: 12, versionName: '1.3.0', notes: 'Faster', size: 22_000_000 },
  ...over,
})

const run = (actions: UpdateAction[], start: UpdateView = initialUpdateView) =>
  actions.reduce(updateReducer, start)

describe('update state machine', () => {
  it('loads the cached status without changing the phase', () => {
    const s = run([{ type: 'status', info: info() }])
    expect(s).toMatchObject({
      loaded: true,
      enabled: true,
      decision: 'available',
      phase: 'idle',
      installedName: '1.0.0',
    })
    expect(s.manifest?.versionName).toBe('1.3.0')
  })

  it('walks check -> download -> verify -> install', () => {
    let s = run([{ type: 'status', info: info() }, { type: 'checking' }])
    expect(s.phase).toBe('checking')
    s = run([{ type: 'checked', info: info() }], s)
    expect(s.phase).toBe('idle')
    s = run([{ type: 'downloading' }], s)
    expect(s).toMatchObject({ phase: 'downloading', progress: { done: 0, total: 0 } })
    s = run([{ type: 'progress', done: 5, total: 20 }], s)
    expect(s.phase).toBe('downloading')
    s = run([{ type: 'progress', done: 20, total: 20 }], s)
    expect(s.phase).toBe('verifying')
    s = run([{ type: 'ready' }, { type: 'installing' }], s)
    expect(s).toMatchObject({ phase: 'installing', progress: null })
  })

  it('stops for permission, and can fail at any point with a message', () => {
    const s = run([{ type: 'status', info: info() }, { type: 'downloading' }, { type: 'needsPermission' }])
    expect(s.phase).toBe('needsPermission')
    const f = run([{ type: 'failed', message: 'integrity check failed' }], s)
    expect(f).toMatchObject({ phase: 'error', error: 'integrity check failed', progress: null })
    expect(run([{ type: 'checking' }], f).error).toBe('') // starting again clears the old error
  })

  it('a failed check keeps the cached forced decision (a forced update must still block offline)', () => {
    const forced = info({ decision: 'forced' })
    const s = run([
      { type: 'status', info: forced },
      { type: 'checking' },
      { type: 'checked', info: info({ decision: 'forced', error: 'Could not reach the update service.' }) },
    ])
    expect(s.phase).toBe('error')
    expect(s.error).toMatch(/Could not reach/)
    expect(isForced(s)).toBe(true)
  })

  it('derives forced / available / busy', () => {
    const avail = run([{ type: 'status', info: info() }])
    expect(isUpdateAvailable(avail)).toBe(true)
    expect(isForced(avail)).toBe(false)
    expect(isForced(run([{ type: 'status', info: info({ decision: 'forced' }) }]))).toBe(true)
    expect(isUpdateAvailable(run([{ type: 'status', info: info({ decision: 'up_to_date' }) }]))).toBe(false)
    // an updater that is not configured never forces or offers anything
    const off = run([{ type: 'status', info: info({ enabled: false, decision: 'forced' }) }])
    expect(isForced(off)).toBe(false)
    expect(isUpdateAvailable(off)).toBe(false)
    expect(isBusy(run([{ type: 'downloading' }]))).toBe(true)
    expect(isBusy(avail)).toBe(false)
  })

  it('describes progress for people', () => {
    expect(describeProgress(null)).toBe('')
    expect(describeProgress({ done: 5_242_880, total: 20_971_520 })).toBe('5.0 of 20.0 MB')
    expect(describeProgress({ done: 5_242_880, total: 0 })).toBe('5.0 MB')
  })
})

describe('pickScreen: a forced update outranks everything but loading', () => {
  const base = { ready: true, forcedUpdate: false, locked: false, consented: true, signedIn: true }
  it('shows nothing until stored state has loaded', () => {
    expect(pickScreen({ ...base, ready: false, forcedUpdate: true })).toBe('blank')
  })
  it('puts the forced update before the lock, the age gate and key entry', () => {
    expect(pickScreen({ ...base, forcedUpdate: true, locked: true, consented: false, signedIn: false })).toBe(
      'update',
    )
  })
  it('otherwise orders lock, gate, login, app', () => {
    expect(pickScreen({ ...base, locked: true, consented: false })).toBe('lock')
    expect(pickScreen({ ...base, consented: false, signedIn: false })).toBe('gate')
    expect(pickScreen({ ...base, signedIn: false })).toBe('login')
    expect(pickScreen(base)).toBe('app')
  })
})
