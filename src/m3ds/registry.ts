import type { Workflow } from '../api/types'
import { outputKinds } from '../lib/schema'
import { infoFor, VIEWER_INFO } from '../results/viewerTable'

// Which workflows return data inside images, and what to expect from them. Declared (not sniffed) so a
// result opens the right viewer straight away and nothing is decoded just because a workflow was tapped.
//
// Carriers:
//  - m3ds:      Meshsmuggler's container (gzip + CRC32, possibly multi-chunk). Decoded by ./codec.
//  - pixeldata: the LLM/VLM/whisper family's "data image" (UTF-8 JSON bytes written straight into pixels).
//               Its pixel layout is not documented yet, so it is recognised but not decoded.

export type Carrier = 'm3ds' | 'pixeldata'

export type Expect =
  | 'model3d' // a single 3D model (.glb/.gltf)
  | 'scene' // several 3D models combined
  | 'text' // text, markdown, json, csv
  | 'score' // YuE2 song score JSON
  | 'rig2d' // content set for a 2D animation rig
  | 'videoproject' // a video editing project
  | 'unknown' // M3DS container, contents not declared: decided by the decoded file name

export interface OutputSpec {
  carrier: Carrier
  expect: Expect
}

/** A user override: a spec, or `null` meaning "ordinary images, never decode". */
export type Overrides = Record<string, OutputSpec | null>

export const EXPECT_LABELS: Record<Expect, string> = {
  model3d: '3D model',
  scene: '3D scene (several models)',
  text: 'Text file',
  score: 'Song score',
  rig2d: '2D animation rig content',
  videoproject: 'Video editing project',
  unknown: 'Unknown (decide from the file)',
}

const m3ds = (expect: Expect): OutputSpec => ({ carrier: 'm3ds', expect })

/**
 * Built-in declarations by workflow slug: the workflows known to return a barcoded (M3DS) image. Workflow
 * backup JSONs carry no slug, so these are the live names. Anything not listed here is ordinary media unless
 * the user marks it (Workflows > detail > Result type).
 */
export const DEFAULT_SPECS: Record<string, OutputSpec | null> = {
  'music-yue2': m3ds('score'), // song score JSON packed in a PNG next to the audio
  'music-yue2-instrumental': m3ds('score'),
  'trellis2-native': m3ds('model3d'), // returns a smuggled mesh; the API flags do not say "mesh"
  // Rig Studio's confirmed live workflows (direction sheet, performance track, intent, A2F probe).
  'rig-direct': m3ds('rig2d'),
  'rig-perform': m3ds('rig2d'),
  'rig-track': m3ds('rig2d'),
  'rig-intent': m3ds('rig2d'),
  'rigstudio-a2f-probe': m3ds('rig2d'),
  // The puppet builder's part sheets and probe return ordinary pictures (3x3 sheets), not a barcoded file.
  'rig-puppet-parts': null,
  'rig-puppet-probe': null,
  // The packing step returns the finished puppet.
  'rig-puppet-pack': m3ds('rig2d'),
}

/** The rig family by name, for workflows whose exact slug is not known here (puppet, set, segmentation). */
const DEFAULT_PATTERNS: Array<[RegExp, OutputSpec]> = [
  [/^rig-/, m3ds('rig2d')],
  [/^rigstudio-/, m3ds('rig2d')],
]

export function defaultSpecForSlug(slug: string): OutputSpec | null {
  if (Object.prototype.hasOwnProperty.call(DEFAULT_SPECS, slug)) return DEFAULT_SPECS[slug]
  for (const [re, spec] of DEFAULT_PATTERNS) if (re.test(slug)) return spec
  return null
}

/**
 * Declared spec for a workflow. Order: the user's override (`null` = ordinary media), the built-in table,
 * then a safe default from the API's own capability flags (a workflow that produces meshes carries them
 * in M3DS), otherwise none.
 */
export function outputSpec(w: Workflow, overrides: Overrides = {}): OutputSpec | null {
  if (Object.prototype.hasOwnProperty.call(overrides, w.slug)) return overrides[w.slug]
  const known = defaultSpecForSlug(w.slug)
  if (known) return known
  if (outputKinds(w).includes('mesh')) return m3ds('model3d')
  return null
}

/**
 * The spec for a job already in the history, resolved when it is shown so a newly declared workflow (or a
 * changed override) applies to old results too. Order: override, what the job stored, the built-in table.
 */
export function specForJob(
  job: { workflowSlug: string; output?: OutputSpec },
  overrides: Overrides = {},
): OutputSpec | null {
  if (Object.prototype.hasOwnProperty.call(overrides, job.workflowSlug)) return overrides[job.workflowSlug]
  return job.output ?? defaultSpecForSlug(job.workflowSlug)
}

/** The manual "Open as M3DS" button: only for undeclared results, only when the advanced setting is on. */
export function showManualM3ds(
  spec: OutputSpec | null,
  manualSetting: boolean,
  hasPixelMedia: boolean,
): boolean {
  return manualSetting && !spec && hasPixelMedia
}

/**
 * What a decoded payload actually is: the `kind` of an entry in `../results/viewerTable.ts`. The viewer is chosen
 * from this, not from what the workflow was declared to return, so a result always opens in the right player (and
 * a surprise is reported rather than misread). New kinds are added in that table, so this is an open string type.
 */
export type PayloadKind = string

const FORMAT_KIND: Record<string, PayloadKind> = Object.fromEntries(
  VIEWER_INFO.flatMap((v) => (v.formats ?? []).map((f) => [f, v.kind] as const)),
)

const EXT_KIND: Array<[RegExp, PayloadKind]> = VIEWER_INFO.flatMap((v) =>
  (v.extensions ?? []).map((re) => [re, v.kind] as [RegExp, PayloadKind]),
)

/**
 * The `format` field of a JSON payload, read from its first bytes only (the real parse happens in the viewer,
 * which validates). Rig Studio files all begin with `{"format": "rigstudio.*", ...}`.
 */
export function peekFormat(data: Uint8Array): string | null {
  if (data.length < 2) return null
  const head = new TextDecoder('utf-8', { fatal: false }).decode(data.subarray(0, 4096))
  if (!/^\s*\{/.test(head)) return null
  return head.match(/"format"\s*:\s*"([a-z0-9_.-]{1,60})"/i)?.[1] ?? null
}

/** The data decides: a known `format`, then glTF magic, then the file name, then the declared type. */
export function identifyPayload(filename: string, data: Uint8Array, expect: Expect = 'unknown'): PayloadKind {
  const format = peekFormat(data)
  if (format && Object.prototype.hasOwnProperty.call(FORMAT_KIND, format)) return FORMAT_KIND[format]
  for (const v of VIEWER_INFO) if (v.magic?.(data)) return v.kind
  for (const [re, kind] of EXT_KIND)
    if (re.test(filename)) return expect === 'score' && kind === 'text' ? 'score' : kind
  if (expect === 'score') return 'score'
  if (expect === 'text') return 'text'
  return 'unknown'
}

/** The button / title wording for a payload once it is known (from the viewer table). */
export const PAYLOAD_LABEL: Record<string, { open: string; title: string }> = new Proxy(
  {},
  { get: (_t, kind: string) => infoFor(kind) },
)

/**
 * The button text before the result is opened, from the workflow and its declared type. Never says "M3DS":
 * that is how the data travels, not what the user is getting.
 */
export function viewLabelFor(slug: string, spec: OutputSpec | null | undefined): string {
  if (/^rig-puppet/.test(slug)) return PAYLOAD_LABEL.puppet.open
  if (slug === 'rig-direct') return PAYLOAD_LABEL.direction.open
  if (slug === 'rig-perform' || slug === 'rig-track') return PAYLOAD_LABEL.track.open
  if (/^rig-set/.test(slug)) return PAYLOAD_LABEL.set.open
  switch (spec?.expect) {
    case 'model3d':
    case 'scene':
      return PAYLOAD_LABEL.model.open
    case 'score':
      return PAYLOAD_LABEL.score.open
    case 'text':
      return PAYLOAD_LABEL.text.open
    case 'rig2d':
      return 'Open rig content'
    case 'videoproject':
      return 'Open project'
    default:
      return PAYLOAD_LABEL.unknown.open
  }
}

const RIG_KINDS: PayloadKind[] = ['puppet', 'direction', 'track', 'set', 'shot']

/** A human note when the payload is not what the workflow was marked as returning. */
export function mismatchNote(expect: Expect, kind: PayloadKind, filename: string): string | null {
  if (expect === 'unknown') return null
  const want: PayloadKind[] =
    expect === 'model3d' || expect === 'scene'
      ? ['model']
      : expect === 'text'
        ? ['text']
        : expect === 'score'
          ? ['score', 'text']
          : expect === 'rig2d'
            ? RIG_KINDS
            : []
  if (want.length === 0) return null // videoproject has no viewer yet
  return want.includes(kind)
    ? null
    : `This workflow is marked as returning ${EXPECT_LABELS[expect].toLowerCase()}, but the file is ${filename}.`
}
