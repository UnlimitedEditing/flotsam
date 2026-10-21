import type { Workflow } from '../api/types'
import { outputKinds } from '../lib/schema'

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
export const DEFAULT_SPECS: Record<string, OutputSpec> = {
  'music-yue2': m3ds('score'), // song score JSON packed in a PNG next to the audio
  'music-yue2-instrumental': m3ds('score'),
  'trellis2-native': m3ds('model3d'), // returns a smuggled mesh; the API flags do not say "mesh"
  // Rig Studio's confirmed live workflows (direction sheet, performance track, intent, A2F probe).
  'rig-direct': m3ds('rig2d'),
  'rig-perform': m3ds('rig2d'),
  'rig-track': m3ds('rig2d'),
  'rig-intent': m3ds('rig2d'),
  'rigstudio-a2f-probe': m3ds('rig2d'),
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

export type ViewerKind = 'model' | 'text' | 'info'

const EXT_VIEWER: Array<[RegExp, ViewerKind]> = [
  [/\.(glb|gltf)$/i, 'model'],
  [/\.(txt|md|json|csv|log|srt|vtt|xml|yaml|yml)$/i, 'text'],
]

/** The decoded file decides the viewer; `expect` only breaks ties and drives warnings. */
export function viewerKind(filename: string, data: Uint8Array, expect: Expect): ViewerKind {
  for (const [re, kind] of EXT_VIEWER) if (re.test(filename)) return kind
  if (data.length >= 4 && String.fromCharCode(data[0], data[1], data[2], data[3]) === 'glTF') return 'model'
  if (expect === 'text' || expect === 'score') return 'text'
  return 'info'
}

/** A human note when the decoded file is not what the workflow was marked as returning. */
export function mismatchNote(expect: Expect, kind: ViewerKind, filename: string): string | null {
  if (expect === 'unknown') return null
  const want: ViewerKind[] =
    expect === 'model3d' || expect === 'scene'
      ? ['model']
      : expect === 'text' || expect === 'score'
        ? ['text']
        : []
  if (want.length === 0) return null // rig2d / videoproject have no viewer yet
  return want.includes(kind)
    ? null
    : `This workflow is marked as returning a ${EXPECT_LABELS[expect].toLowerCase()}, but the file is ${filename}.`
}
