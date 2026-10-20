import { getApiKey } from './storage'
import { createLineBuffer, parseStreamLine, type StreamEvent } from './stream'
import type { RenderImage, RenderInfo, ResolvedMedia, SourceMedia, Workflow } from './types'

// Dev uses the Vite proxy ('/gd/'). Production needs VITE_API_BASE pointing at the CORS proxy Worker
// (PWA) or a native HTTP client (Capacitor), because the real API sends no CORS headers.
export const DEFAULT_BASE = import.meta.env.DEV ? '/gd/' : 'https://app.graydient.ai/api/v3/'
const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? DEFAULT_BASE
// WebSockets are not subject to CORS, so they always go straight to Graydient.
const WS_BASE = (import.meta.env.VITE_WS_BASE as string | undefined) ?? 'wss://app.graydient.ai'
const API_ORIGIN = 'https://app.graydient.ai'
const API_PREFIX = '/api/v3/'

function headers(): Record<string, string> {
  return {
    'Content-Type': 'application/vnd.api+json',
    Accept: 'application/vnd.api+json',
    Authorization: `Bearer ${getApiKey()}`,
  }
}

export class ApiError extends Error {
  status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.status = status
  }
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      cache: 'no-store',
      ...init,
      headers: { ...headers(), ...init.headers },
    })
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e
    // A network-level TypeError from a browser is most often a CORS block.
    throw new ApiError(`Network/CORS error calling ${path}: ${(e as Error).message}`)
  }
  if (!res.ok) throw new ApiError(`${path} failed: ${res.status}`, res.status)
  return res
}

export async function get<T>(path: string): Promise<T> {
  return (await (await request(path)).json()) as T
}

// ── Workflows ────────────────────────────────────────────────────────────────

interface JsonApiItem {
  id: string
  attributes?: Omit<Workflow, 'id'>
}
interface ListResponse {
  data?: JsonApiItem[]
  links?: { next?: string | null }
}

/** Turns a `links.next` value (absolute or relative) into a path our BASE can fetch. */
export function nextToPath(next: string): string {
  const u = new URL(next, API_ORIGIN)
  return u.pathname.startsWith(API_PREFIX) ? u.pathname.slice(API_PREFIX.length) + u.search : next
}

const MAX_PAGES = 50

export async function fetchWorkflows(): Promise<Workflow[]> {
  const out = new Map<string, Workflow>()
  let path: string | null = 'workflows/'
  for (let page = 0; path && page < MAX_PAGES; page++) {
    const json: ListResponse | JsonApiItem[] = await get<ListResponse | JsonApiItem[]>(path)
    const items: JsonApiItem[] = Array.isArray(json) ? json : (json.data ?? [])
    for (const i of items) {
      out.set(i.id, { id: i.id, ...(i.attributes ?? (i as unknown as Omit<Workflow, 'id'>)) })
    }
    const next: string | null | undefined = Array.isArray(json) ? null : json.links?.next
    path = next && items.length ? nextToPath(next) : null
  }
  return [...out.values()]
}

// ── Renders ──────────────────────────────────────────────────────────────────

export async function fetchRenderInfo(hash: string): Promise<RenderInfo> {
  const json = await get<{ data?: { attributes?: RenderInfo } } & RenderInfo>(`render/${hash}/`)
  return json.data?.attributes ?? json
}

export function resolveAllMedia(images: RenderImage[] | undefined): ResolvedMedia[] {
  return (images ?? []).flatMap((img) => {
    if (img.media && img.media.length > 0) {
      return img.media.map((m) => ({
        url: m.url,
        mediaType: m.media_type ?? null,
        thumbnailUrl: img.url ?? null,
      }))
    }
    return img.url ? [{ url: img.url, mediaType: null, thumbnailUrl: null }] : []
  })
}

export async function cancelRender(hash: string): Promise<void> {
  try {
    await request(`render/${hash}/cancel/`, { method: 'POST' })
  } catch {
    /* best effort: the render may already be finished */
  }
}

export interface SubmitResult {
  renderHash: string | null
  estimatedRenderTime: number | null
  estimatedWaitTime: number | null
  images: RenderImage[] | null
}

/**
 * POST render/ with Graydient's slash-command prompt passed straight through, and read the SSE stream
 * until rendering_done / rendering_error / stream end. Mirrors the CLI's submitRenderRaw.
 * The stream can end before rendering_done, or finish without images; callers then use waitForMedia().
 */
export async function submitRender(
  prompt: string,
  opts: { sourceMedia?: SourceMedia; signal?: AbortSignal; onEvent?: (e: StreamEvent) => void } = {},
): Promise<SubmitResult> {
  const body: Record<string, unknown> = {
    prompt: prompt.trim(),
    task: 'workflow',
    progressive_return: true,
    stream: true,
    placeholders: {},
    session_id: `flotsam-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  }
  if (opts.sourceMedia?.initImage) body.init_image = opts.sourceMedia.initImage
  if (opts.sourceMedia?.initImageUrl) body.init_image_url = opts.sourceMedia.initImageUrl

  const res = await request('render/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: opts.signal,
  })
  if (!res.body) throw new ApiError('render/ returned no stream')

  const result: SubmitResult = {
    renderHash: null,
    estimatedRenderTime: null,
    estimatedWaitTime: null,
    images: null,
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  const feed = createLineBuffer()
  let failure: string | null = null

  outer: while (true) {
    const { done, value } = await reader.read()
    if (done) break
    for (const line of feed(decoder.decode(value, { stream: true }))) {
      const evt = parseStreamLine(line)
      if (!evt) continue
      opts.onEvent?.(evt)
      if (evt.name === 'render_queued') {
        result.renderHash = (evt.data.render_hash as string | undefined) ?? result.renderHash
        result.estimatedRenderTime = (evt.data.estimated_render_time as number | undefined) ?? null
        result.estimatedWaitTime = (evt.data.estimated_wait_time as number | undefined) ?? null
      } else if (evt.name === 'rendering_done') {
        result.renderHash = (evt.data.render_hash as string | undefined) ?? result.renderHash
        result.images = (evt.data.images as RenderImage[] | undefined) ?? null
        reader.cancel().catch(() => {})
        break outer
      } else if (evt.name === 'rendering_error') {
        failure = String(evt.data.message ?? evt.data.error ?? 'Rendering failed')
        reader.cancel().catch(() => {})
        break outer
      }
    }
  }
  if (failure) throw new ApiError(failure)
  return result
}

/** Waits on the render-events WebSocket for a `done` event. Resolves null on timeout/abort/failure. */
export function waitForRenderEvent(
  hash: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<RenderImage[] | null> {
  return new Promise((resolve) => {
    let ws: WebSocket | null = null
    let ping: ReturnType<typeof setInterval> | undefined
    let timer: ReturnType<typeof setTimeout> | undefined
    const finish = (images: RenderImage[] | null) => {
      clearInterval(ping)
      clearTimeout(timer)
      try {
        ws?.close()
      } catch {
        /* ignore */
      }
      signal?.removeEventListener('abort', onAbort)
      resolve(images)
    }
    const onAbort = () => finish(null)
    signal?.addEventListener('abort', onAbort)
    timer = setTimeout(() => finish(null), timeoutMs)
    try {
      ws = new WebSocket(`${WS_BASE}/render-events/${hash}?token=${encodeURIComponent(getApiKey())}`)
    } catch {
      finish(null)
      return
    }
    ws.onmessage = (e) => {
      const evt = parseStreamLine(String(e.data))
      if (evt?.name === 'rendering_done') finish((evt.data.images as RenderImage[] | undefined) ?? null)
    }
    ws.onerror = () => finish(null)
    ping = setInterval(() => {
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ command: 'ping' }))
    }, 25_000)
  })
}

/** Backoff used by the CLI; the last value repeats until the ceiling. Video media can lag `done` by minutes. */
export const POLL_DELAYS_MS = [1000, 2000, 3000, 5000, 8000, 13000, 20000, 30000, 45000]

export async function pollRenderMedia(
  hash: string,
  opts: { signal?: AbortSignal; ceilingMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<ResolvedMedia[]> {
  const ceiling = opts.ceilingMs ?? 40 * 60_000
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  let waited = 0
  for (let attempt = 0; waited <= ceiling; attempt++) {
    if (opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    try {
      const media = resolveAllMedia((await fetchRenderInfo(hash)).images)
      if (media.length) return media
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e
      /* transient: retry on the next tick */
    }
    const delay = POLL_DELAYS_MS[Math.min(attempt, POLL_DELAYS_MS.length - 1)]
    await sleep(delay)
    waited += delay
  }
  return []
}
