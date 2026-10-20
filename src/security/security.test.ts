import { describe, expect, it } from 'vitest'
import { memoryStore } from '../jobs/store'
import { shouldLock } from './lock'
import { constantTimeEqual, createPinService, isValidPin, lockoutDelayMs } from './pin'
import { clearAllData, type WipeIO } from './wipe'

const fast = 1000 // PBKDF2 iterations: low so tests run quickly; production uses 310k

describe('PIN format', () => {
  it('is 4 to 8 digits', () => {
    for (const ok of ['1234', '12345678', '0000']) expect(isValidPin(ok)).toBe(true)
    for (const bad of ['123', '123456789', '12a4', '', '12 34']) expect(isValidPin(bad)).toBe(false)
  })
})

describe('PIN service', () => {
  it('round-trips and never stores the PIN', async () => {
    const store = memoryStore()
    const svc = createPinService(store, () => 0, fast)
    expect(await svc.hasPin()).toBe(false)
    await svc.setPin('4821')
    expect(await svc.hasPin()).toBe(true)
    expect(await svc.verify('4821')).toEqual({ ok: true })
    expect((await svc.verify('1111')).ok).toBe(false)
    const raw = JSON.stringify(await store.read('pin.v1', null))
    expect(raw).not.toContain('4821')
    expect(raw).toContain('salt')
  })

  it('uses a fresh salt each time', async () => {
    const a = memoryStore()
    const b = memoryStore()
    await createPinService(a, () => 0, fast).setPin('4821')
    await createPinService(b, () => 0, fast).setPin('4821')
    expect(JSON.stringify(await a.read('pin.v1', null))).not.toBe(
      JSON.stringify(await b.read('pin.v1', null)),
    )
  })

  it('slows down guessing and the lockout survives a new service instance (a reload)', async () => {
    const store = memoryStore()
    let t = 1_000_000
    const svc = createPinService(store, () => t, fast)
    await svc.setPin('4821')
    for (let i = 0; i < 4; i++)
      expect(await svc.verify('0000')).toMatchObject({ ok: false, reason: 'wrong', retryAfterMs: 0 })
    const fifth = await svc.verify('0000')
    expect(fifth).toMatchObject({ ok: false, reason: 'wrong', retryAfterMs: 30_000 })

    // Even the right PIN is refused during the lockout, including after a "reload".
    const reloaded = createPinService(store, () => t, fast)
    expect(await reloaded.verify('4821')).toMatchObject({ ok: false, reason: 'locked' })
    t += 31_000
    expect(await reloaded.verify('4821')).toEqual({ ok: true })
    expect(await store.read('pin.lockout.v1', null)).toEqual({ failures: 0, lockedUntil: 0 })
  })

  it('escalates the delay and caps it', () => {
    expect([1, 4, 5, 6, 7].map(lockoutDelayMs)).toEqual([0, 0, 30_000, 60_000, 120_000])
    expect(lockoutDelayMs(40)).toBe(15 * 60_000)
  })

  it('needs the current PIN to change or remove it', async () => {
    const svc = createPinService(memoryStore(), () => 0, fast)
    await svc.setPin('1234')
    expect((await svc.changePin('9999', '5678')).ok).toBe(false)
    expect((await svc.verify('1234')).ok).toBe(true)
    expect((await svc.changePin('1234', '5678')).ok).toBe(true)
    expect((await svc.verify('5678')).ok).toBe(true)
    expect((await svc.removePin('0000')).ok).toBe(false)
    expect(await svc.hasPin()).toBe(true)
    expect((await svc.removePin('5678')).ok).toBe(true)
    expect(await svc.hasPin()).toBe(false)
    expect(await svc.verify('5678')).toMatchObject({ ok: false, reason: 'no-pin' })
  })

  it('rejects a malformed new PIN', async () => {
    await expect(createPinService(memoryStore(), () => 0, fast).setPin('12')).rejects.toThrow(/4 to 8/)
  })
})

describe('constantTimeEqual', () => {
  it('compares bytes', () => {
    expect(constantTimeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2]))).toBe(true)
    expect(constantTimeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 3]))).toBe(false)
    expect(constantTimeEqual(new Uint8Array([1]), new Uint8Array([1, 2]))).toBe(false)
  })
})

describe('auto-lock timing', () => {
  const base = { hasPin: true, timeoutMin: 1, hiddenAt: 0, now: 0 }
  it('locks only after the configured time away', () => {
    expect(shouldLock({ ...base, now: 59_000 })).toBe(false)
    expect(shouldLock({ ...base, now: 60_000 })).toBe(true)
  })
  it('locks on any absence when set to immediately, never when set to never', () => {
    expect(shouldLock({ ...base, timeoutMin: 0, now: 1 })).toBe(true)
    expect(shouldLock({ ...base, timeoutMin: -1, now: 10 ** 9 })).toBe(false)
  })
  it('never locks without a PIN or without a recorded absence', () => {
    expect(shouldLock({ ...base, hasPin: false, timeoutMin: 0, now: 99 })).toBe(false)
    expect(shouldLock({ ...base, hiddenAt: null, timeoutMin: 0, now: 99 })).toBe(false)
  })
})

describe('clear all data', () => {
  it('runs every wipe step, even if one fails, and resets in-memory state', async () => {
    const calls: string[] = []
    const io: WipeIO = {
      clearLocal: () => {
        calls.push('local')
        throw new Error('blocked')
      },
      clearSession: () => calls.push('session'),
      clearStored: async () => void calls.push('stored'),
      resetMemory: () => calls.push('memory'),
    }
    await clearAllData(io)
    expect(calls).toEqual(['local', 'session', 'stored', 'memory'])
  })
})
