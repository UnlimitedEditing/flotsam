import { useCallback, useEffect, useState } from 'react'
import { fetchWorkflows } from '../api/client'
import type { Workflow } from '../api/types'
import { idbStore } from '../jobs/store'

// Workflow metadata (no media) is cached so the picker opens instantly; it is fetched once per session
// (the full list is many pages) and again only when the user pulls to refresh.
const KEY = 'workflows.v1'
let memo: Workflow[] | null = null
let fetchedThisSession = false
let inflight: Promise<Workflow[]> | null = null

function fetchFresh(): Promise<Workflow[]> {
  inflight ??= fetchWorkflows()
    .then(async (list) => {
      memo = list
      fetchedThisSession = true
      await idbStore.write(KEY, list)
      return list
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}

export function useWorkflows() {
  const [workflows, setWorkflows] = useState<Workflow[]>(memo ?? [])
  const [loading, setLoading] = useState(!fetchedThisSession)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setWorkflows(await fetchFresh())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let alive = true
    void (async () => {
      if (!memo) {
        const cached = await idbStore.read<Workflow[]>(KEY, [])
        if (cached.length && alive) {
          memo = cached
          setWorkflows(cached)
        }
      }
      if (!fetchedThisSession && alive) await refresh()
    })()
    return () => {
      alive = false
    }
  }, [refresh])

  return { workflows, loading, error, refresh }
}
