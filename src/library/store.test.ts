import { beforeEach, describe, expect, it, vi } from 'vitest'

// idb-keyval has no IndexedDB in node, so every call takes the in-memory fallback path: the same code the app
// runs when IndexedDB is blocked.
async function fresh() {
  vi.resetModules()
  const store = await import('./store')
  const jobs = await import('../jobs/store')
  return { ...store, ...jobs }
}

const bytes = (n: number, fill = 7) => new Uint8Array(n).fill(fill)
const base = { kind: 'puppet' as const, name: 'Bob', filename: 'bob.json', bytes: bytes(10) }

let lib: Awaited<ReturnType<typeof fresh>>
beforeEach(async () => {
  lib = await fresh()
})

describe('library store', () => {
  it('adds, lists newest first, reads bytes back, renames and removes', async () => {
    const a = await lib.addToLibrary({ ...base, name: 'First' })
    await new Promise((r) => setTimeout(r, 3))
    const b = await lib.addToLibrary({ ...base, name: 'Second', bytes: bytes(20, 9) })
    expect((await lib.listLibrary()).map((i) => i.name)).toEqual(['Second', 'First'])
    expect(await lib.getLibraryBytes(b.id)).toEqual(bytes(20, 9))
    expect(await lib.libraryUsage()).toEqual({ count: 2, bytes: 30 })

    await lib.renameLibraryItem(a.id, '  Renamed   puppet ')
    expect((await lib.listLibrary()).find((i) => i.id === a.id)?.name).toBe('Renamed puppet')

    await lib.removeLibraryItem(a.id)
    expect((await lib.listLibrary()).map((i) => i.id)).toEqual([b.id])
    expect(await lib.getLibraryBytes(a.id)).toBeNull()
  })

  it('keeps names sane and metadata honest', async () => {
    const i = await lib.addToLibrary({ ...base, name: '   ', nsfw: true, sourceJobId: 'j1', thumb: 'data:x' })
    expect(i.name).toBe('Untitled')
    expect(i).toMatchObject({ nsfw: true, sourceJobId: 'j1', thumb: 'data:x', size: 10 })
    const long = await lib.addToLibrary({ ...base, name: 'x'.repeat(500) })
    expect(long.name.length).toBe(lib.LIMITS.name)
  })

  it('refuses empty files, oversized files, and a full library', async () => {
    await expect(lib.addToLibrary({ ...base, bytes: new Uint8Array(0) })).rejects.toThrow(/empty/)
    await expect(lib.addToLibrary({ ...base, bytes: new Uint8Array(lib.LIMITS.item + 1) })).rejects.toThrow(
      /too large/,
    )
    // total space
    const chunk = lib.LIMITS.item
    for (let i = 0; i < Math.floor(lib.LIMITS.total / chunk); i++)
      await lib.addToLibrary({ ...base, bytes: new Uint8Array(chunk) })
    await expect(lib.addToLibrary({ ...base, bytes: new Uint8Array(chunk) })).rejects.toThrow(/out of space/)
  })

  it('serialises quick successive writes without losing any', async () => {
    await Promise.all(Array.from({ length: 12 }, (_, k) => lib.addToLibrary({ ...base, name: `n${k}` })))
    expect(await lib.listLibrary()).toHaveLength(12)
  })

  it('clearLibrary empties it', async () => {
    await lib.addToLibrary(base)
    await lib.addToLibrary(base)
    await lib.clearLibrary()
    expect(await lib.listLibrary()).toEqual([])
    expect(await lib.libraryUsage()).toEqual({ count: 0, bytes: 0 })
  })
})

describe('Clear all data and the library', () => {
  it('a wipe empties the library, including the in-memory copies', async () => {
    const item = await lib.addToLibrary(base)
    await lib.clearAllStored()
    expect(await lib.listLibrary()).toEqual([])
    expect(await lib.getLibraryBytes(item.id)).toBeNull()
  })

  it('after a wipe nothing can be saved until the app reloads (no resurrecting what was wiped)', async () => {
    await lib.addToLibrary(base)
    await lib.clearAllStored()
    await expect(lib.addToLibrary(base)).rejects.toThrow(/reset/)
    expect(await lib.listLibrary()).toEqual([])
  })
})
