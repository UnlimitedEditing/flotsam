import type { Workflow } from '../api/types'
import { classify } from './schema'
import { isVisible } from './visibility'

/** Workflows that can take a shared image as input: they have an image slot we can fill. */
export function imageWorkflows(workflows: Workflow[], showAdult: boolean, query = ''): Workflow[] {
  const q = query.trim().toLowerCase()
  return workflows
    .filter((w) => isVisible(w, showAdult))
    .filter((w) => classify(w).media.some((m) => m.kind === 'image' && m.via !== 'unsupported'))
    .filter((w) => !q || `${w.name} ${w.slug}`.toLowerCase().includes(q))
}

export function base64ToBlob(base64: string, mime: string): Blob {
  const bin = atob(base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: mime })
}

/** Parses flotsam://job/<id> (the notification deep link). */
export function jobIdFromUrl(url: string): string | null {
  const m = url.match(/^flotsam:\/\/job\/([^/?#]+)/)
  return m ? decodeURIComponent(m[1]) : null
}
