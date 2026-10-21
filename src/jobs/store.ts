import { clear, get, set } from 'idb-keyval'

// IndexedDB with an in-memory fallback, so a blocked/private-mode browser never breaks the app.
export interface KeyValueStore {
  read<T>(key: string, fallback: T): Promise<T>
  write<T>(key: string, value: T): Promise<void>
}

const memory = new Map<string, unknown>()
// After "clear all data" nothing may write back (a late save would resurrect what was just wiped).
let frozen = false

const wipeListeners = new Set<() => void>()

/** Other stores that keep their own in-memory copies (the library) register here so a wipe empties them too. */
export function onStoreWipe(fn: () => void): void {
  wipeListeners.add(fn)
}

export const isStoreFrozen = (): boolean => frozen

/** Wipes everything stored through idbStore and refuses further writes until the page reloads. */
export async function clearAllStored(): Promise<void> {
  frozen = true
  memory.clear()
  wipeListeners.forEach((fn) => fn())
  try {
    await clear()
  } catch {
    /* IndexedDB unavailable: the memory copy is already gone */
  }
}

export const idbStore: KeyValueStore = {
  async read<T>(key: string, fallback: T): Promise<T> {
    try {
      const v = await get<T>(key)
      if (v !== undefined) return v
    } catch {
      /* fall through to memory */
    }
    return (memory.get(key) as T | undefined) ?? fallback
  },
  async write<T>(key: string, value: T): Promise<void> {
    if (frozen) return
    memory.set(key, value)
    try {
      await set(key, value)
    } catch {
      /* memory copy is kept for this session */
    }
  },
}

export function memoryStore(): KeyValueStore {
  const m = new Map<string, unknown>()
  return {
    read: async <T>(key: string, fallback: T) => (m.get(key) as T | undefined) ?? fallback,
    write: async <T>(key: string, value: T) => void m.set(key, structuredClone(value)),
  }
}
