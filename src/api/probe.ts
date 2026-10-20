import { get } from './client'

// Dev diagnostics: reports the *shape* of the workflows list (keys, links, meta, counts), never the
// contents or the API key, so the output is safe to paste into a bug report.
export async function probeWorkflows(): Promise<string> {
  const out: string[] = []
  const shape = (j: unknown) => {
    const o = (j ?? {}) as Record<string, unknown>
    const data = Array.isArray(o.data) ? o.data : Array.isArray(j) ? (j as unknown[]) : []
    return {
      keys: Array.isArray(j) ? ['<array>'] : Object.keys(o),
      count: data.length,
      links: o.links,
      meta: o.meta,
      firstId: (data[0] as { id?: string } | undefined)?.id,
    }
  }
  const first = shape(await get<unknown>('workflows/'))
  out.push(`page1: ${JSON.stringify(first)}`)
  for (const q of [
    'workflows/?page=2',
    'workflows/?page[number]=2',
    'workflows/?offset=500',
    'workflows/?page[offset]=500',
  ]) {
    try {
      const s = shape(await get<unknown>(q))
      out.push(`${q}: count=${s.count} firstId=${s.firstId} sameAsPage1=${s.firstId === first.firstId}`)
    } catch (e) {
      out.push(`${q}: ${(e as Error).message}`)
    }
  }
  return out.join('\n')
}
