import type { Workflow, WorkflowFieldMapping } from '../api/types'

// Fields the form renders as inputs. Everything else in field_mapping (prompt_positive, init_*_url,
// node plumbing) is handled by the command itself or by the image picker.
const OPTION_FIELDS = new Set([
  'seed',
  'steps',
  'guidance',
  'length',
  'fps',
  'slot1',
  'slot2',
  'slot3',
  'slot4',
  'slot5',
  'slot6',
  'slot7',
  'slot8',
])
const IMAGE_FIELDS = /^(init_image|image\d*|init_image_url)/

export function formFields(w: Workflow): WorkflowFieldMapping[] {
  return (w.field_mapping ?? []).filter((f) => OPTION_FIELDS.has(f.local_field))
}

export function hasNegativeField(w: Workflow): boolean {
  return (w.field_mapping ?? []).some((f) => f.local_field === 'negative_prompt')
}

export function wantsImage(w: Workflow): boolean {
  return (
    w.supports_img2img ||
    w.supports_img2vid ||
    w.supports_vid2vid ||
    (w.field_mapping ?? []).some((f) => IMAGE_FIELDS.test(f.local_field))
  )
}

export interface CommandInput {
  workflowSlug: string
  prompt: string
  negative?: string
  /** local_field -> raw value as typed. Blank values are omitted so workflow defaults apply. */
  options?: Record<string, string>
}

/** Builds Graydient's slash-command string: `/workflow /run:<slug> /key:value ... <prompt> [<negative>]`. */
export function buildCommand(c: CommandInput): string {
  const opts = Object.entries(c.options ?? {})
    .map(([k, v]) => [k, v.trim()] as const)
    .filter(([, v]) => v !== '')
    .map(([k, v]) => `/${k}:${v}`)
  const parts = ['/workflow', `/run:${c.workflowSlug}`, ...opts, c.prompt.trim()]
  const neg = c.negative?.trim()
  if (neg) parts.push(`[${neg}]`)
  return parts.filter(Boolean).join(' ')
}

/** Returns an error message, or null if the value fits the field's declared range. */
export function validateOption(f: WorkflowFieldMapping, raw: string): string | null {
  const v = raw.trim()
  if (v === '') return null
  const n = Number(v)
  if (Number.isNaN(n)) return 'Must be a number'
  if (f.minimum_value != null && n < f.minimum_value) return `Min ${f.minimum_value}`
  if (f.maximum_value != null && n > f.maximum_value) return `Max ${f.maximum_value}`
  return null
}
