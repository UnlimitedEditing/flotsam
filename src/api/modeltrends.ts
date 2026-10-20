import { idbStore, type KeyValueStore } from '../jobs/store'

// ModelTrends heat score (https://modeltrends.ai/api-docs): free, no key, CORS enabled.
// Terms we follow: show a plain visible link to the model's page next to any number; cache each model for
// a day; request only models the user actually opens; never present the score as our own measurement.

const BASE = 'https://modeltrends.ai'
const DAY_MS = 24 * 60 * 60 * 1000

export interface Heat {
  id: string
  name: string
  score: number
  scaleMax: number
  tier: 'hot' | 'warm' | 'cool' | string
  weekPct: number | null
  rank: { rank: number; of: number } | null // overall standing
  pageUrl: string
}

/** Accepts a model page URL (`.../qwen-image-asian-mix-lora-df7074ba`) or a bare 8-character id. */
export function parseModelId(input: string): string | null {
  const t = input
    .trim()
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '')
  if (/^[0-9a-f]{8}$/i.test(t)) return t.toLowerCase()
  const m = t.match(/\/ai-models\/[^/]+\/[^/]*?-([0-9a-f]{8})$/i)
  return m ? m[1].toLowerCase() : null
}

interface CacheEntry {
  at: number
  heat: Heat | null // null = "no score" (404: unknown, no data yet, or an adult model)
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** Defensive: the API only ever adds fields, so read what we need and ignore the rest. */
export function readHeat(id: string, json: unknown): Heat | null {
  const j = (json ?? {}) as Record<string, unknown>
  const heat = (j.heat ?? {}) as Record<string, unknown>
  const links = (j.links ?? {}) as Record<string, unknown>
  const score = num(heat.score)
  if (score == null || typeof links.page !== 'string') return null
  const trend = (j.trend ?? {}) as Record<string, unknown>
  const overall = Array.isArray(j.standings)
    ? (j.standings as Array<Record<string, unknown>>).find((s) => s.kind === 'overall')
    : undefined
  const rank =
    overall && num(overall.rank) != null && num(overall.of) != null
      ? { rank: overall.rank as number, of: overall.of as number }
      : null
  return {
    id,
    rank,
    name: typeof j.name === 'string' ? j.name : id,
    score,
    scaleMax: num(heat.scale_max) ?? 9999,
    tier: typeof heat.tier === 'string' ? heat.tier : 'cool',
    weekPct: num((trend.week as Record<string, unknown> | undefined)?.pct) ?? num(trend.week),
    pageUrl: links.page,
  }
}

export function createHeatClient(
  deps: { fetch?: typeof fetch; store?: KeyValueStore; now?: () => number } = {},
) {
  const doFetch = deps.fetch ?? ((u: string) => fetch(u))
  const store = deps.store ?? idbStore
  const now = deps.now ?? Date.now

  return {
    /** One request per model per day. Returns null when there is no score to show. */
    async get(id: string): Promise<Heat | null> {
      const key = `mt.v1.${id}`
      const cached = await store.read<CacheEntry | null>(key, null)
      if (cached && now() - cached.at < DAY_MS) return cached.heat
      let heat: Heat | null = null
      try {
        const res = await doFetch(`${BASE}/v1/model/${id}.json`)
        if (res.ok) heat = readHeat(id, await res.json())
        else if (res.status !== 404) return cached?.heat ?? null // transient: keep the stale copy, retry later
      } catch {
        return cached?.heat ?? null
      }
      await store.write<CacheEntry>(key, { at: now(), heat })
      return heat
    },
  }
}

export const heatClient = createHeatClient()
