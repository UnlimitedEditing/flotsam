import type { KeyValueStore } from '../jobs/store'

// A local PIN for the app lock. This is casual-access protection (a borrowed phone, a glance), not strong
// security: it runs in the browser and guards data that sits in the same browser profile. Biometric lock is
// Android (Phase 4).
//
// The PIN is never stored. We keep a random salt and a PBKDF2-SHA256 hash; wrong guesses are slowed with an
// escalating lockout that survives reloads.

const PIN_KEY = 'pin.v1'
const LOCKOUT_KEY = 'pin.lockout.v1'
export const DEFAULT_ITERATIONS = 310_000
export const FREE_ATTEMPTS = 4 // the 5th wrong attempt starts the first lockout
export const MAX_DELAY_MS = 15 * 60_000

export const PIN_PATTERN = /^\d{4,8}$/
export const isValidPin = (pin: string): boolean => PIN_PATTERN.test(pin)

interface PinRecord {
  salt: string
  hash: string
  iterations: number
}

interface Lockout {
  failures: number
  lockedUntil: number
}

/** Delay after the Nth consecutive wrong attempt: none for the first four, then 30 s doubling to 15 min. */
export function lockoutDelayMs(failures: number): number {
  if (failures <= FREE_ATTEMPTS) return 0
  return Math.min(MAX_DELAY_MS, 30_000 * 2 ** (failures - FREE_ATTEMPTS - 1))
}

const b64 = (u: Uint8Array): string => btoa(String.fromCharCode(...u))
const unb64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

async function derive(pin: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, [
    'deriveBits',
  ])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    key,
    256,
  )
  return new Uint8Array(bits)
}

/** Compares without exiting early on the first differing byte. */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]
  return diff === 0
}

export type VerifyResult =
  { ok: true } | { ok: false; retryAfterMs: number; reason: 'wrong' | 'locked' | 'no-pin' }

export function createPinService(
  store: KeyValueStore,
  now: () => number = Date.now,
  iterations: number = DEFAULT_ITERATIONS,
) {
  const readLockout = () => store.read<Lockout>(LOCKOUT_KEY, { failures: 0, lockedUntil: 0 })

  async function verify(pin: string): Promise<VerifyResult> {
    const rec = await store.read<PinRecord | null>(PIN_KEY, null)
    if (!rec) return { ok: false, retryAfterMs: 0, reason: 'no-pin' }
    const lock = await readLockout()
    const wait = lock.lockedUntil - now()
    if (wait > 0) return { ok: false, retryAfterMs: wait, reason: 'locked' }

    const given = await derive(pin, unb64(rec.salt), rec.iterations)
    if (constantTimeEqual(given, unb64(rec.hash))) {
      await store.write<Lockout>(LOCKOUT_KEY, { failures: 0, lockedUntil: 0 })
      return { ok: true }
    }
    const failures = lock.failures + 1
    const delay = lockoutDelayMs(failures)
    await store.write<Lockout>(LOCKOUT_KEY, { failures, lockedUntil: delay ? now() + delay : 0 })
    return { ok: false, retryAfterMs: delay, reason: 'wrong' }
  }

  return {
    hasPin: async () => (await store.read<PinRecord | null>(PIN_KEY, null)) !== null,

    async setPin(pin: string): Promise<void> {
      if (!isValidPin(pin)) throw new Error('A PIN is 4 to 8 digits.')
      const salt = crypto.getRandomValues(new Uint8Array(16))
      const hash = await derive(pin, salt, iterations)
      await store.write<PinRecord>(PIN_KEY, { salt: b64(salt), hash: b64(hash), iterations })
      await store.write<Lockout>(LOCKOUT_KEY, { failures: 0, lockedUntil: 0 })
    },

    verify,

    /** Changing or removing a PIN needs the current one. */
    async changePin(current: string, next: string): Promise<VerifyResult> {
      if (!isValidPin(next)) throw new Error('A PIN is 4 to 8 digits.')
      const r = await verify(current)
      if (r.ok) await this.setPin(next)
      return r
    },

    async removePin(current: string): Promise<VerifyResult> {
      const r = await verify(current)
      if (r.ok) {
        await store.write<PinRecord | null>(PIN_KEY, null)
        await store.write<Lockout>(LOCKOUT_KEY, { failures: 0, lockedUntil: 0 })
      }
      return r
    },

    readLockout,
  }
}
