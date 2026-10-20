import type { Workflow, WorkflowFieldMapping } from '../api/types'

// Turns a workflow's own field_mapping into a form description, so the UI follows the workflow's data
// instead of a hard-coded list. Verified against the live API probe (658 workflows) and the CLI notes.

export type OutputKind = 'image' | 'video' | 'audio' | 'mesh' | 'text'

/** Output kinds from the supports_* capability flags. A workflow may produce several. */
export function outputKinds(w: Workflow): OutputKind[] {
  const f = w as unknown as Record<string, unknown>
  const on = (k: string) => f[`supports_${k}`] === true
  const out = new Set<OutputKind>()
  if (on('txt2img') || on('img2img') || on('vid2img') || on('mesh2img')) out.add('image')
  if (on('txt2vid') || on('img2vid') || on('vid2vid') || on('mesh2vid')) out.add('video')
  if (on('txt2wav') || on('vid2wav')) out.add('audio')
  if (on('txt2mesh') || on('img2mesh')) out.add('mesh')
  if (on('wav2txt')) out.add('text')
  return [...out]
}

export const hasResolution = (kinds: OutputKind[]) => kinds.includes('image') || kinds.includes('video')

export interface SizeControl {
  mode: 'wh' | 'size'
  min: number | null
  max: number | null
  defaultW: number | null
  defaultH: number | null
}

export type MediaKind = 'image' | 'video' | 'audio' | 'mesh'

export interface MediaSlot {
  id: string // stable key for form state
  kind: MediaKind
  label: string
  /** init: sent as init_image/init_video/... ; placeholder: /imageN:URLn + placeholders (verified for imageN) */
  via: 'init' | 'placeholder' | 'unsupported'
  n?: number // placeholder index (image3 -> 3)
  required: boolean
}

export interface OptionField {
  field: string // local_field
  key: string // slash-command key
  label: string
  numeric: boolean
  min: number | null
  max: number | null
  def: string
  help: string
  note?: string
}

export interface Schema {
  hasPrompt: boolean
  negativeField?: string
  size?: SizeControl
  media: MediaSlot[]
  options: OptionField[]
  outputs: OutputKind[]
}

const PROMPT_FIELDS = new Set(['prompt_positive', 'prompt', 'raw_prompt'])
const NEGATIVE_FIELDS = new Set(['prompt_negative', 'negative_prompt'])
const SIZE_PARTS = new Set(['width', 'height', 'size'])

/** local_field -> slash-command key, where they differ. */
const COMMAND_KEY: Record<string, string> = { num_images: 'images' }

const LABELS: Record<string, string> = {
  num_images: 'Images',
  controlguidance: 'Control guidance',
  clipskip: 'Clip skip',
  fps: 'FPS',
  length: 'Length (frames)',
}

const MEDIA_RE: Array<[RegExp, (m: RegExpMatchArray) => Omit<MediaSlot, 'required'>]> = [
  [
    /^init_image(_url|_filename)?$/,
    () => ({ id: 'init_image', kind: 'image', label: 'Input image', via: 'init' }),
  ],
  [
    /^init_video(_url|_filename)?$/,
    () => ({ id: 'init_video', kind: 'video', label: 'Input video', via: 'init' }),
  ],
  [
    /^init_audio(_url|_filename)?$/,
    () => ({ id: 'init_audio', kind: 'audio', label: 'Input audio', via: 'init' }),
  ],
  [/^init_mesh_url$/, () => ({ id: 'init_mesh', kind: 'mesh', label: 'Input mesh', via: 'init' })],
  [
    /^image(\d+)$/,
    (m) => ({
      id: `image${m[1]}`,
      kind: 'image',
      label: `Reference image ${m[1]}`,
      via: 'placeholder',
      n: Number(m[1]),
    }),
  ],
  [/^mask_image_filename$/, () => ({ id: 'mask', kind: 'image', label: 'Mask image', via: 'unsupported' })],
  [
    /^(left|right|back)_image_url$/,
    (m) => ({ id: `${m[1]}_image`, kind: 'image', label: `${m[1]} view`, via: 'unsupported' }),
  ],
  [
    /^controlnet_image$/,
    () => ({ id: 'controlnet', kind: 'image', label: 'ControlNet image', via: 'unsupported' }),
  ],
  [
    /^(video|audio)(\d+)$/,
    (m) => ({ id: `${m[1]}${m[2]}`, kind: m[1] as MediaKind, label: `${m[1]} ${m[2]}`, via: 'unsupported' }),
  ],
]

function isNumeric(f: WorkflowFieldMapping): boolean {
  if (f.minimum_value != null || f.maximum_value != null) return true
  return (
    typeof f.default_value === 'number' ||
    (typeof f.default_value === 'string' && f.default_value !== '' && !Number.isNaN(Number(f.default_value)))
  )
}

export function classify(w: Workflow): Schema {
  const fields = w.field_mapping ?? []
  const byName = new Map(fields.map((f) => [f.local_field, f]))
  const outputs = outputKinds(w)

  let size: SizeControl | undefined
  if (hasResolution(outputs)) {
    const wf = byName.get('width')
    const hf = byName.get('height')
    if (wf && hf) {
      size = {
        mode: 'wh',
        min: Math.max(wf.minimum_value ?? 0, hf.minimum_value ?? 0) || null,
        max: Math.min(wf.maximum_value ?? Infinity, hf.maximum_value ?? Infinity) || null,
        defaultW: wf.default_value != null ? Number(wf.default_value) : null,
        defaultH: hf.default_value != null ? Number(hf.default_value) : null,
      }
      if (size.max === Infinity) size.max = null
    } else if (byName.has('size')) {
      size = { mode: 'size', min: null, max: null, defaultW: null, defaultH: null }
    }
  }

  const media = new Map<string, MediaSlot>()
  const options: OptionField[] = []
  for (const f of fields) {
    const name = f.local_field
    if (PROMPT_FIELDS.has(name) || NEGATIVE_FIELDS.has(name) || SIZE_PARTS.has(name)) continue
    let matched = false
    for (const [re, make] of MEDIA_RE) {
      const m = name.match(re)
      if (!m) continue
      const slot = make(m)
      if (!media.has(slot.id)) media.set(slot.id, { ...slot, required: false })
      matched = true
      break
    }
    if (matched) continue
    options.push({
      field: name,
      key: COMMAND_KEY[name] ?? name,
      label: LABELS[name] ?? name.replace(/_/g, ' '),
      numeric: isNumeric(f),
      min: f.minimum_value,
      max: f.maximum_value,
      def: f.default_value != null ? String(f.default_value) : '',
      help: f.help_text ?? '',
      note: name === 'slot9' ? 'Slots normally end at 8; this one may not be delivered.' : undefined,
    })
  }

  // Slots that take an input image become required when the workflow can only do image-to-X.
  const needsInput = !w.supports_txt2img && !w.supports_txt2vid
  const slots = [...media.values()].sort((a, b) => (a.n ?? 0) - (b.n ?? 0))
  for (const s of slots) {
    if (s.id === 'init_image' || s.id === 'init_video' || s.id === 'init_audio') s.required = needsInput
  }

  const hasField = (set: Set<string>) => fields.find((f) => set.has(f.local_field))?.local_field
  return {
    hasPrompt: !!hasField(PROMPT_FIELDS) || fields.length === 0,
    negativeField: hasField(NEGATIVE_FIELDS),
    size,
    media: slots,
    options,
    outputs,
  }
}

export function validateNumber(raw: string, min: number | null, max: number | null): string | null {
  const v = raw.trim()
  if (v === '') return null
  const n = Number(v)
  if (Number.isNaN(n)) return 'Must be a number'
  if (min != null && n < min) return `Min ${min}`
  if (max != null && n > max) return `Max ${max}`
  return null
}
