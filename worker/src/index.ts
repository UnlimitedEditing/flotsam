// Flotsam CORS proxy. app.graydient.ai sends no CORS headers, so a browser/PWA can't call it
// directly. This Worker forwards /api/v3/* to Graydient and adds CORS headers.
//
// Deliberately minimal:
//  - stores nothing (no KV/R2/D1) and logs nothing: requests carry users' API keys
//  - only forwards to one fixed upstream host and one path prefix (not an open proxy)
//  - requires an Authorization header, so anonymous callers can't use it
//  - streams request and response bodies, so the SSE stream on POST render/ passes through
//
// WebSockets (render-events) are not subject to CORS and connect to Graydient directly.

export interface Env {
  ALLOWED_ORIGINS?: string
}

export const UPSTREAM = 'https://app.graydient.ai'
const PATH_PREFIX = '/api/v3/'
const MAX_BODY_BYTES = 1_000_000 // render requests are small JSON; media goes by URL, never through here
const ALLOWED_METHODS = ['GET', 'POST']
const FORWARD_REQUEST_HEADERS = ['authorization', 'content-type', 'accept']
const FORWARD_RESPONSE_HEADERS = ['content-type', 'cache-control', 'retry-after']

function allowedOrigin(request: Request, env: Env): string | null {
  const origin = request.headers.get('origin')
  if (!origin) return null
  const list = (env.ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return list.includes('*') || list.includes(origin) ? origin : null
}

function corsHeaders(origin: string): Headers {
  const h = new Headers()
  h.set('access-control-allow-origin', origin)
  h.set('access-control-allow-headers', 'authorization, content-type, accept')
  h.set('access-control-allow-methods', 'GET, POST, OPTIONS')
  h.set('access-control-max-age', '86400')
  h.set('vary', 'origin')
  return h
}

function fail(status: number, message: string, cors?: Headers): Response {
  const headers = cors ?? new Headers()
  headers.set('content-type', 'application/json')
  return new Response(JSON.stringify({ errors: [{ status, title: message }] }), { status, headers })
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = allowedOrigin(request, env)
    const url = new URL(request.url)

    if (request.method === 'OPTIONS') {
      return origin
        ? new Response(null, { status: 204, headers: corsHeaders(origin) })
        : fail(403, 'Origin not allowed')
    }
    // Browsers always send Origin on cross-origin calls; non-browser callers get no CORS grant.
    if (!origin) return fail(403, 'Origin not allowed')
    const cors = corsHeaders(origin)

    if (!ALLOWED_METHODS.includes(request.method)) return fail(405, 'Method not allowed', cors)
    if (!url.pathname.startsWith(PATH_PREFIX)) return fail(404, 'Not found', cors)
    if (!request.headers.get('authorization')) return fail(401, 'Missing Authorization header', cors)

    const length = Number(request.headers.get('content-length') ?? 0)
    if (length > MAX_BODY_BYTES) return fail(413, 'Request body too large', cors)

    const upstreamHeaders = new Headers()
    for (const name of FORWARD_REQUEST_HEADERS) {
      const value = request.headers.get(name)
      if (value) upstreamHeaders.set(name, value)
    }

    let upstream: Response
    try {
      upstream = await fetch(`${UPSTREAM}${url.pathname}${url.search}`, {
        method: request.method,
        headers: upstreamHeaders,
        body: request.method === 'POST' ? request.body : undefined,
        redirect: 'manual',
      })
    } catch {
      return fail(502, 'Upstream unreachable', cors)
    }

    const headers = cors
    for (const name of FORWARD_RESPONSE_HEADERS) {
      const value = upstream.headers.get(name)
      if (value) headers.set(name, value)
    }
    // Streamed through untouched, so text/event-stream renders arrive incrementally.
    return new Response(upstream.body, { status: upstream.status, headers })
  },
}
