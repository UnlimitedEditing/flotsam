import type { SourceMedia, Workflow } from '../api/types'
import type { MediaSlot, Schema } from './schema'

export interface FormValues {
  prompt: string
  negative: string
  options: Record<string, string> // by local_field; blank = workflow default
  width: string
  height: string
  sizeText: string // for workflows that map a single `size` field
  media: Record<string, string> // slot id -> URL
}

export const emptyForm = (): FormValues => ({
  prompt: '',
  negative: '',
  options: {},
  width: '',
  height: '',
  sizeText: '',
  media: {},
})

const num = (s: string): number | null => (s.trim() !== '' && !Number.isNaN(Number(s)) ? Number(s) : null)

/** `/size:WxH` (verified: Graydient rejects /width: and /height:). Only sent when it differs from the defaults. */
export function sizeToken(schema: Schema, v: FormValues): string | null {
  const s = schema.size
  if (!s) return null
  if (s.mode === 'size') return v.sizeText.trim() ? `/size:${v.sizeText.trim()}` : null
  const w = num(v.width)
  const h = num(v.height)
  if (w == null && h == null) return null
  const fw = w ?? s.defaultW
  const fh = h ?? s.defaultH
  if (fw == null || fh == null) return null
  if (fw === s.defaultW && fh === s.defaultH) return null
  return `/size:${fw}x${fh}`
}

export interface Request {
  command: string
  source: SourceMedia
}

/** Builds Graydient's slash-command string plus the media fields that ride alongside it. */
export function buildRequest(w: Workflow, schema: Schema, v: FormValues): Request {
  const parts = ['/workflow', `/run:${w.slug}`]
  for (const o of schema.options) {
    const val = (v.options[o.field] ?? '').trim()
    if (val !== '') parts.push(`/${o.key}:${val}`)
  }
  const size = sizeToken(schema, v)
  if (size) parts.push(size)

  const source: SourceMedia = {}
  const placeholders: Record<string, string> = {}
  for (const slot of schema.media) {
    const url = (v.media[slot.id] ?? '').trim()
    if (!url) continue
    applySlot(slot, url, source, placeholders, parts)
  }
  if (Object.keys(placeholders).length) source.placeholders = placeholders

  if (v.prompt.trim()) parts.push(v.prompt.trim())
  if (schema.negativeField && v.negative.trim()) parts.push(`[${v.negative.trim()}]`)
  return { command: parts.join(' '), source }
}

function applySlot(
  slot: MediaSlot,
  url: string,
  source: SourceMedia,
  placeholders: Record<string, string>,
  parts: string[],
): void {
  if (slot.via === 'placeholder' && slot.n != null) {
    // Verified: the placeholder key must look like URL<n>; arbitrary names are rejected by the server.
    parts.push(`/image${slot.n}:URL${slot.n}`)
    placeholders[`URL${slot.n}`] = url
  } else if (slot.id === 'init_image') {
    source.initImage = url
    source.initImageUrl = url
  } else if (slot.id === 'init_video') {
    source.initVideoUrl = url
    source.initVideo = url
  } else if (slot.id === 'init_audio') {
    source.initAudioUrl = url
    source.initAudio = url
  } else if (slot.id === 'init_mesh') {
    source.initMeshUrl = url
  }
}

/** Slots Flotsam cannot deliver yet, so the form can say so instead of silently dropping them. */
export function unsupportedSlots(schema: Schema): MediaSlot[] {
  return schema.media.filter((s) => s.via === 'unsupported')
}

export function missingRequired(schema: Schema, v: FormValues): MediaSlot[] {
  return schema.media.filter((s) => s.required && s.via !== 'unsupported' && !(v.media[s.id] ?? '').trim())
}
