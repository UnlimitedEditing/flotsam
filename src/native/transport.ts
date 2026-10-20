import type { FlotsamNativePlugin } from './plugin'

// The Android app talks to Graydient through the Kotlin plugin (OkHttp): no CORS, and responses stream.
// The plugin is wrapped so callers still see an ordinary `Response`, which keeps the existing SSE reader,
// WebSocket fallback and polling code (and their tests) unchanged.

export interface TransportOptions {
  /** Read the response incrementally (the SSE render stream). */
  stream?: boolean
  /** The job a streamed render belongs to, so the native side can watch it in the background. */
  jobId?: string
}

export type TransportFetch = (url: string, init: RequestInit, opts?: TransportOptions) => Promise<Response>

type Headers = Record<string, string>

function headersOf(init: RequestInit): Headers {
  const out: Headers = {}
  new globalThis.Headers(init.headers).forEach((v, k) => (out[k] = v))
  return out
}

let counter = 0

export function createNativeFetch(
  plugin: Pick<FlotsamNativePlugin, 'request' | 'stream' | 'cancelStream' | 'addListener'>,
): TransportFetch {
  return async (url, init, opts = {}) => {
    const method = (init.method ?? 'GET').toUpperCase()
    const headers = headersOf(init)
    const body = typeof init.body === 'string' ? init.body : undefined

    if (!opts.stream) {
      if (init.signal?.aborted) throw new DOMException('Aborted', 'AbortError')
      const r = await plugin.request({ method, url, headers, body })
      return new Response(r.body, { status: r.status, headers: r.headers })
    }
    return openStream(plugin, {
      url,
      method,
      headers,
      body,
      jobId: opts.jobId,
      signal: init.signal ?? undefined,
    })
  }
}

async function openStream(
  plugin: Pick<FlotsamNativePlugin, 'stream' | 'cancelStream' | 'addListener'>,
  o: { url: string; method: string; headers: Headers; body?: string; jobId?: string; signal?: AbortSignal },
): Promise<Response> {
  const id = `s${Date.now()}-${++counter}`
  const enc = new TextEncoder()
  let controller!: ReadableStreamDefaultController<Uint8Array>
  const body = new ReadableStream<Uint8Array>({
    start: (c) => {
      controller = c
    },
    cancel: () => void plugin.cancelStream({ id }),
  })

  let settle!: (r: Response) => void
  let fail!: (e: unknown) => void
  const first = new Promise<Response>((resolve, reject) => {
    settle = resolve
    fail = reject
  })
  let started = false
  let closed = false
  const handles: Array<{ remove: () => Promise<void> }> = []
  const cleanup = () => {
    for (const h of handles) void h.remove()
  }

  handles.push(
    await plugin.addListener('streamLine', (e) => {
      if (e.id !== id || closed) return
      if (!started) {
        started = true
        settle(new Response(body, { status: 200 }))
      }
      controller.enqueue(enc.encode(e.line + '\n'))
    }),
    await plugin.addListener('streamEnd', (e) => {
      if (e.id !== id || closed) return
      closed = true
      cleanup()
      if (e.error && e.error !== 'canceled') {
        const err = new TypeError(e.error)
        if (started) controller.error(err)
        else fail(err)
      } else if (e.status >= 400 && !started) {
        settle(new Response(e.body, { status: e.status }))
        controller.close()
      } else {
        if (!started) settle(new Response(body, { status: e.status || 200 }))
        controller.close()
      }
    }),
  )

  const onAbort = () => {
    void plugin.cancelStream({ id })
    if (!started) fail(new DOMException('Aborted', 'AbortError'))
  }
  if (o.signal) {
    if (o.signal.aborted) onAbort()
    else o.signal.addEventListener('abort', onAbort, { once: true })
  }

  await plugin.stream({ id, jobId: o.jobId, method: o.method, url: o.url, headers: o.headers, body: o.body })
  return first
}
