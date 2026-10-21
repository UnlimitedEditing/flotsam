import { del, get, set } from 'idb-keyval'
import { useMemo, useSyncExternalStore } from 'react'
import { isStoreFrozen, onStoreWipe } from '../jobs/store'

// The library: things the user chose to keep (a puppet they built, a direction sheet, an image). It is the one
// place where generated media is stored on this device, so it is explicit and visible: nothing enters it unless
// the user taps "Add to library", every item can be seen, renamed and deleted, the totals are shown, and
// "Clear all data" empties it. It lives in IndexedDB (never Cache Storage, so the service worker cannot serve it)
// with an in-memory fallback where IndexedDB is blocked.

export type LibraryKind =
  'puppet' | 'direction' | 'track' | 'set' | 'shot' | 'model' | 'text' | 'score' | 'image' | 'other'

export interface LibraryItem {
  id: string
  kind: LibraryKind
  name: string
  filename: string
  createdAt: number
  size: number // bytes
  thumb?: string // a small data URL
  nsfw: boolean // keeps its thumbnail blurred
  sourceJobId?: string
}

export interface NewLibraryItem {
  kind: LibraryKind
  name: string
  filename: string
  bytes: Uint8Array
  thumb?: string
  nsfw?: boolean
  sourceJobId?: string
}

export class LibraryError extends Error {}

export const LIMITS = {
  item: 40 * 1024 * 1024, // one item
  total: 400 * 1024 * 1024, // the whole library
  items: 500,
  name: 80,
}

const INDEX_KEY = 'lib:index'
const dataKey = (id: string) => `lib:data:${id}`

// in-memory copy: the fallback where IndexedDB is unavailable, and the cache the UI reads
let index: LibraryItem[] | null = null
const memoryData = new Map<string, Uint8Array>()
const listeners = new Set<() => void>()
let chain: Promise<unknown> = Promise.resolve()

const emit = () => listeners.forEach((l) => l())
// serialise writes so two quick taps cannot overwrite each other's index
const queued = <T>(fn: () => Promise<T>): Promise<T> => {
  const next = chain.then(fn, fn)
  chain = next.catch(() => {})
  return next
}

onStoreWipe(() => {
  index = []
  memoryData.clear()
  emit()
})

async function load(): Promise<LibraryItem[]> {
  if (index) return index
  let loaded: LibraryItem[] | undefined
  try {
    loaded = await get<LibraryItem[]>(INDEX_KEY)
  } catch {
    /* IndexedDB unavailable: start empty */
  }
  index ??= Array.isArray(loaded) ? loaded : []
  emit()
  return index
}

async function saveIndex(items: LibraryItem[]) {
  index = items
  emit()
  if (isStoreFrozen()) return
  try {
    await set(INDEX_KEY, items)
  } catch {
    /* kept in memory for this session */
  }
}

const cleanName = (n: string) => n.replace(/\s+/g, ' ').trim().slice(0, LIMITS.name) || 'Untitled'
const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

export async function listLibrary(): Promise<LibraryItem[]> {
  return [...(await load())].sort((a, b) => b.createdAt - a.createdAt)
}

export async function libraryUsage(): Promise<{ count: number; bytes: number }> {
  const items = await load()
  return { count: items.length, bytes: items.reduce((n, i) => n + i.size, 0) }
}

export function addToLibrary(input: NewLibraryItem): Promise<LibraryItem> {
  return queued(async () => {
    if (isStoreFrozen()) throw new LibraryError('The app was just reset; reload it before saving.')
    const items = await load()
    const size = input.bytes.byteLength
    if (size === 0) throw new LibraryError('That file is empty.')
    if (size > LIMITS.item)
      throw new LibraryError(
        `That file is too large for the library (limit ${LIMITS.item / 1024 / 1024} MB).`,
      )
    if (items.length >= LIMITS.items) throw new LibraryError('The library is full: delete something first.')
    if (items.reduce((n, i) => n + i.size, 0) + size > LIMITS.total)
      throw new LibraryError('The library is out of space: delete something first.')
    const item: LibraryItem = {
      id: newId(),
      kind: input.kind,
      name: cleanName(input.name),
      filename: input.filename.slice(0, 120),
      createdAt: Date.now(),
      size,
      nsfw: !!input.nsfw,
      ...(input.thumb ? { thumb: input.thumb } : {}),
      ...(input.sourceJobId ? { sourceJobId: input.sourceJobId } : {}),
    }
    memoryData.set(item.id, input.bytes)
    try {
      await set(dataKey(item.id), input.bytes)
    } catch {
      /* the memory copy serves this session */
    }
    await saveIndex([...items, item])
    return item
  })
}

export async function getLibraryBytes(id: string): Promise<Uint8Array | null> {
  const fromMemory = memoryData.get(id)
  if (fromMemory) return fromMemory
  try {
    const v = await get<Uint8Array>(dataKey(id))
    if (v) return v
  } catch {
    /* fall through */
  }
  return null
}

export function renameLibraryItem(id: string, name: string): Promise<void> {
  return queued(async () => {
    const items = await load()
    await saveIndex(items.map((i) => (i.id === id ? { ...i, name: cleanName(name) } : i)))
  })
}

export function removeLibraryItem(id: string): Promise<void> {
  return queued(async () => {
    const items = await load()
    memoryData.delete(id)
    if (!isStoreFrozen()) {
      try {
        await del(dataKey(id))
      } catch {
        /* nothing to remove */
      }
    }
    await saveIndex(items.filter((i) => i.id !== id))
  })
}

export function clearLibrary(): Promise<void> {
  return queued(async () => {
    const items = await load()
    memoryData.clear()
    for (const i of items) {
      try {
        await del(dataKey(i.id))
      } catch {
        /* ignore */
      }
    }
    await saveIndex([])
  })
}

/** Test hook: forget the cached state so the next call reads storage again. */
export function resetLibraryCache(): void {
  index = null
  memoryData.clear()
}

const subscribe = (cb: () => void) => {
  listeners.add(cb)
  void load()
  return () => listeners.delete(cb)
}
const EMPTY: LibraryItem[] = []
const snapshot = () => index ?? EMPTY

/** The library items, newest first, live. */
export function useLibrary(): LibraryItem[] {
  const items = useSyncExternalStore(subscribe, snapshot)
  return useMemo(
    () => (items === EMPTY ? items : [...items].sort((a, b) => b.createdAt - a.createdAt)),
    [items],
  )
}
