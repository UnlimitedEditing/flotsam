// Pure parsing of Graydient's render stream (SSE over fetch, and the render-events WebSocket).
// Two wire shapes have been seen: {event, data} and {render_queued: {...}} (key = event name).
// Ported from ForgeExpress/cli/src/client.ts streamRenderBody.

export type StreamEventName =
  'render_queued' | 'rendering_started' | 'rendering_done' | 'rendering_error' | string

export interface StreamEvent {
  name: StreamEventName
  data: Record<string, unknown>
}

const ALIASES: Record<string, StreamEventName> = {
  started: 'rendering_started',
  done: 'rendering_done',
  error: 'rendering_error',
}

const WRAPPED = ['render_queued', 'rendering_started', 'rendering_done', 'rendering_error'] as const

/** Returns null for blank lines, [DONE] and non-JSON lines. */
export function parseStreamLine(line: string): StreamEvent | null {
  const raw = (line.startsWith('data:') ? line.slice(5) : line).trim()
  if (!raw || raw === '[DONE]') return null
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>
  } catch {
    return null
  }
  if (parsed === null || typeof parsed !== 'object') return null

  if (typeof parsed.event === 'string') {
    const data = (parsed.data as Record<string, unknown> | undefined) ?? {}
    return { name: ALIASES[parsed.event] ?? parsed.event, data }
  }
  for (const key of WRAPPED) {
    if (parsed[key]) return { name: key, data: parsed[key] as Record<string, unknown> }
  }
  const first = Object.keys(parsed)[0]
  return { name: first ?? 'unknown', data: {} }
}

/** Incremental line splitter for a streamed body. Feed chunks; get complete lines out. */
export function createLineBuffer(): (chunk: string) => string[] {
  let buffer = ''
  return (chunk) => {
    buffer += chunk
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    return lines
  }
}
