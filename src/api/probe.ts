import { fetchWorkflows, get } from './client'

// Dev diagnostics: reports the *shape* of the workflows list (keys, links, meta, counts, field names),
// never workflow text content or the API key, so the output is safe to paste into a bug report.
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
      attrKeys: Object.keys((data[0] as { attributes?: object } | undefined)?.attributes ?? {}),
    }
  }
  const raw = await get<unknown>('workflows/')
  const first = shape(raw)
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

  // Which fields do workflows actually map, and does the API carry any type/tag attribute?
  const all = await fetchWorkflows()
  out.push(`total after pagination: ${all.length}`)
  const counts = new Map<string, number>()
  for (const w of all)
    for (const f of w.field_mapping ?? []) counts.set(f.local_field, (counts.get(f.local_field) ?? 0) + 1)
  out.push(
    `field names: ${[...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k, n]) => `${k}=${n}`)
      .join(', ')}`,
  )

  const tagish = new Map<string, Set<string>>()
  for (const w of all) {
    for (const [k, v] of Object.entries(w as unknown as Record<string, unknown>)) {
      if (!/type|tag|categor|kind|output|family|model/i.test(k) || /^supports_/.test(k)) continue
      const vals = Array.isArray(v)
        ? v.map(String)
        : typeof v === 'string' || typeof v === 'number'
          ? [String(v)]
          : []
      if (!tagish.has(k)) tagish.set(k, new Set())
      vals.forEach((x) => tagish.get(k)!.add(x.slice(0, 40)))
    }
  }
  for (const [k, v] of tagish) out.push(`attr ${k}: ${[...v].slice(0, 25).join(' | ')}`)

  const moss = all.filter((w) => /moss/i.test(w.slug)).slice(0, 3)
  for (const w of moss) {
    out.push(
      `${w.slug}: ` +
        (w.field_mapping ?? [])
          .map(
            (f) =>
              `${f.local_field}[${f.minimum_value ?? ''}..${f.maximum_value ?? ''}] def=${f.default_value ?? ''}`,
          )
          .join('; '),
    )
  }
  return out.join('\n')
}
