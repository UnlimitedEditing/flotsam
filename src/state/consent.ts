import { useSyncExternalStore } from 'react'
import { idbStore } from '../jobs/store'
import { TERMS_VERSION } from '../legal/terms'

// The 18+ / terms acceptance. Stored locally (Graydient has no endpoint for it) with the terms version, so a
// new version asks again. Everything that touches the network checks isConsentValid() first (api/client.ts).

export interface Consent {
  version: string
  acceptedAt: number
  over18: boolean
}

const KEY = 'consent.v1'

/** Pure: is this stored consent valid for the given terms version? */
export function hasValidConsent(c: Consent | null | undefined, version: string): boolean {
  return !!c && c.over18 === true && c.version === version
}

let current: Consent | null = null
let loaded = false
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export const consentReady: Promise<void> = idbStore.read<Consent | null>(KEY, null).then((c) => {
  current = c
  loaded = true
  emit()
})

export const isConsentLoaded = () => loaded
export const isConsentValid = (): boolean => hasValidConsent(current, TERMS_VERSION)

export async function acceptConsent(now: () => number = Date.now): Promise<void> {
  current = { version: TERMS_VERSION, acceptedAt: now(), over18: true }
  loaded = true
  emit()
  await idbStore.write(KEY, current)
}

export async function revokeConsent(): Promise<void> {
  current = null
  emit()
  await idbStore.write(KEY, null)
}

/** For clear-all-data: forget in-memory state without touching storage (storage is wiped separately). */
export function resetConsentMemory(): void {
  current = null
  emit()
}

const subscribe = (cb: () => void) => (listeners.add(cb), () => listeners.delete(cb))
export const onConsentChange = subscribe
export const useConsentValid = (): boolean => useSyncExternalStore(subscribe, isConsentValid)
export const useConsentLoaded = (): boolean => useSyncExternalStore(subscribe, isConsentLoaded)
