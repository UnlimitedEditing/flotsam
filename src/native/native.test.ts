import { describe, expect, it, vi } from 'vitest'
import { createNativeFetch } from './transport'
import type { StreamEnd, StreamLine } from './plugin'

type Emit = {
  line: (id: string, line: string) => void
  end: (e: Partial<StreamEnd> & { id: string }) => void
}

function fakePlugin() {
  const lineFns: Array<(e: StreamLine) => void> = []
  const endFns: Array<(e: StreamEnd) => void> = []
  const calls = { stream: vi.fn(), cancel: vi.fn(), request: vi.fn() }
  const plugin = {
    request: calls.request,
    stream: async (o: { id: string }) => void calls.stream(o),
    cancelStream: async (o: { id: string }) => void calls.cancel(o),
    addListener: async (event: string, fn: (e: never) => void) => {
      if (event === 'streamLine') lineFns.push(fn as (e: StreamLine) => void)
      if (event === 'streamEnd') endFns.push(fn as (e: StreamEnd) => void)
      return { remove: async () => {} }
    },
  }
  const emit: Emit = {
    line: (id, line) => lineFns.forEach((f) => f({ id, line })),
    end: (e) => endFns.forEach((f) => f({ status: 200, error: '', body: '', ...e })),
  }
  return { plugin, calls, emit }
}

const idOf = (calls: { stream: ReturnType<typeof vi.fn> }) =>
  (calls.stream.mock.calls[0][0] as { id: string }).id
const tick = () => new Promise((r) => setTimeout(r, 0))

describe('native transport: plain requests', () => {
  it('turns the plugin response into an ordinary Response', async () => {
    const { plugin, calls } = fakePlugin()
    calls.request.mockResolvedValue({
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: '{"a":1}',
    })
    const f = createNativeFetch(plugin as never)
    const res = await f('https://app.graydient.ai/api/v3/workflows/', {
      headers: { Authorization: 'Bearer k' },
    })
    expect(res.ok).toBe(true)
    expect(await res.json()).toEqual({ a: 1 })
    expect(calls.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'GET',
        url: 'https://app.graydient.ai/api/v3/workflows/',
        headers: { authorization: 'Bearer k' },
      }),
    )
  })

  it('passes error statuses through', async () => {
    const { plugin, calls } = fakePlugin()
    calls.request.mockResolvedValue({ status: 401, headers: {}, body: '{"errors":[]}' })
    const res = await createNativeFetch(plugin as never)('https://app.graydient.ai/x', {})
    expect(res.status).toBe(401)
    expect(res.ok).toBe(false)
  })
})

describe('native transport: streaming', () => {
  it('delivers lines as they arrive and closes at the end', async () => {
    const { plugin, calls, emit } = fakePlugin()
    const p = createNativeFetch(plugin as never)(
      'https://app.graydient.ai/api/v3/render/',
      { method: 'POST', body: '{}' },
      { stream: true, jobId: 'job1' },
    )
    await tick()
    const id = idOf(calls)
    expect(calls.stream).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: 'job1', method: 'POST', body: '{}' }),
    )
    emit.line(id, 'data: {"render_queued":{"render_hash":"h"}}')
    const res = await p
    expect(res.status).toBe(200)
    const reader = res.body!.getReader()
    const dec = new TextDecoder()
    const first = await reader.read()
    expect(dec.decode(first.value)).toBe('data: {"render_queued":{"render_hash":"h"}}\n')
    emit.line(id, 'data: {"rendering_done":{}}')
    expect(dec.decode((await reader.read()).value)).toBe('data: {"rendering_done":{}}\n')
    emit.end({ id })
    expect((await reader.read()).done).toBe(true)
  })

  it('ignores events for other streams', async () => {
    const { plugin, calls, emit } = fakePlugin()
    const p = createNativeFetch(plugin as never)(
      'https://app.graydient.ai/x',
      { method: 'POST' },
      { stream: true },
    )
    await tick()
    emit.line('someone-else', 'nope')
    emit.line(idOf(calls), 'mine')
    const res = await p
    const text = await new Promise<string>((resolve) => {
      const reader = res.body!.getReader()
      void reader.read().then((r) => resolve(new TextDecoder().decode(r.value)))
    })
    expect(text).toBe('mine\n')
  })

  it('returns an error status when the server refuses before any data', async () => {
    const { plugin, calls, emit } = fakePlugin()
    const p = createNativeFetch(plugin as never)(
      'https://app.graydient.ai/x',
      { method: 'POST' },
      { stream: true },
    )
    await tick()
    emit.end({ id: idOf(calls), status: 403, body: '{"errors":[{"title":"Missing Authentication Token"}]}' })
    const res = await p
    expect(res.status).toBe(403)
    expect(await res.text()).toContain('Missing Authentication Token')
  })

  it('rejects when the connection fails before any data', async () => {
    const { plugin, calls, emit } = fakePlugin()
    const p = createNativeFetch(plugin as never)(
      'https://app.graydient.ai/x',
      { method: 'POST' },
      { stream: true },
    )
    await tick()
    emit.end({ id: idOf(calls), status: 0, error: 'Unable to resolve host' })
    await expect(p).rejects.toThrow('Unable to resolve host')
  })

  it('errors the body when the connection drops mid-stream', async () => {
    const { plugin, calls, emit } = fakePlugin()
    const p = createNativeFetch(plugin as never)(
      'https://app.graydient.ai/x',
      { method: 'POST' },
      { stream: true },
    )
    await tick()
    const id = idOf(calls)
    emit.line(id, 'first')
    const res = await p
    const reader = res.body!.getReader()
    await reader.read()
    emit.end({ id, error: 'Stream interrupted' })
    await expect(reader.read()).rejects.toThrow('Stream interrupted')
  })

  it('cancels the native stream when aborted', async () => {
    const { plugin, calls } = fakePlugin()
    const ctl = new AbortController()
    const p = createNativeFetch(plugin as never)(
      'https://app.graydient.ai/x',
      { method: 'POST', signal: ctl.signal },
      { stream: true },
    )
    await tick()
    ctl.abort()
    await expect(p).rejects.toMatchObject({ name: 'AbortError' })
    expect(calls.cancel).toHaveBeenCalledWith({ id: idOf(calls) })
  })
})
