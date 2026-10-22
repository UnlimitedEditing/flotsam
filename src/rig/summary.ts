// Read-only summaries of the Rig Studio files that have no player in the app yet (performance track, set, shot).
// The files come from the network, so they are parsed defensively: a size cap, the expected `format`, and every
// number and name read through a guard. A summary never draws anything from the file except a face image of a
// set, which is checked to be a PNG first. Playing and editing them is the staging task (docs/roadmap/07).

export class SummaryError extends Error {}

const MAX_BYTES = 64 * 1024 * 1024
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)
const str = (v: unknown, max = 120): string | undefined =>
  typeof v === 'string' ? v.slice(0, max) : undefined
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const PNG_B64 = 'iVBORw0KGgo'

function parse(data: Uint8Array, format: string, what: string): Record<string, unknown> {
  if (data.length > MAX_BYTES) throw new SummaryError(`This ${what} file is too large to open here.`)
  let raw: unknown
  try {
    raw = JSON.parse(new TextDecoder().decode(data))
  } catch {
    throw new SummaryError(`This is not a readable ${what} file.`)
  }
  if (!isObj(raw) || raw.format !== format) throw new SummaryError(`This is not a Rig Studio ${what}.`)
  return raw
}

/** The last part of a path or URL, for display (never fetched). */
export const baseName = (s: string | undefined) => (s ? (s.split(/[\\/]/).pop() ?? s).slice(0, 80) : '')

export interface TrackSummary {
  duration?: number
  fps?: number
  frames?: number
  role?: string
  source?: string
  layers: Array<{ name: string; blend?: string; channels: number }>
  /** The channels that move the most, as [name, peak 0..1 of the largest value seen]. */
  active: Array<[string, number]>
  visemes: number
  events: number
}

export function summariseTrack(data: Uint8Array): TrackSummary {
  const j = parse(data, 'rigstudio.expression_track', 'performance track')
  const layers: TrackSummary['layers'] = []
  const peak = new Map<string, number>()
  if (isObj(j.layers)) {
    for (const [name, l] of Object.entries(j.layers).slice(0, 24)) {
      if (!isObj(l)) continue
      const curves = isObj(l.curves) ? l.curves : {}
      layers.push({ name: name.slice(0, 40), blend: str(l.blend, 20), channels: Object.keys(curves).length })
      for (const [ch, v] of Object.entries(curves).slice(0, 120)) {
        let m = 0
        for (const x of arr(v)) {
          const n = num(x)
          if (n !== undefined && Math.abs(n) > m) m = Math.abs(n)
        }
        peak.set(ch.slice(0, 40), Math.max(peak.get(ch.slice(0, 40)) ?? 0, m))
      }
    }
  }
  const src = isObj(j.source) ? j.source : {}
  return {
    duration: num(j.duration),
    fps: num(j.fps),
    frames: num(j.frames),
    role: str(j.role, 20),
    source: baseName(str(src.audio) ?? str(src.video)) || undefined,
    layers,
    active: [...peak.entries()]
      .filter(([, v]) => v > 0.01)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8),
    visemes: arr(j.visemes).length,
    events: arr(j.events).length,
  }
}

export interface SetSummary {
  name?: string
  size?: [number, number]
  fov?: number
  props: number
  faces: Array<{ name: string; size?: [number, number] }>
  hasCleanPlate: boolean
  /** A data URL of the back wall, when the file has a valid PNG for it. */
  preview?: string
}

export function summariseSet(data: Uint8Array): SetSummary {
  const j = parse(data, 'rigstudio.set', 'set')
  const pair = (v: unknown): [number, number] | undefined => {
    const a = arr(v)
    const x = num(a[0])
    const y = num(a[1])
    return a.length === 2 && x !== undefined && y !== undefined ? [x, y] : undefined
  }
  const files = isObj(j.files) ? j.files : {}
  const faces: SetSummary['faces'] = []
  let preview: string | undefined
  if (isObj(j.faces)) {
    for (const [name, f] of Object.entries(j.faces).slice(0, 12)) {
      if (!isObj(f)) continue
      faces.push({ name: name.slice(0, 20), size: pair(f.size) })
      const file = str(f.file, 80)
      const b64 = file && Object.prototype.hasOwnProperty.call(files, file) ? files[file] : undefined
      if (name === 'back' && typeof b64 === 'string' && b64.startsWith(PNG_B64) && b64.length < 6_000_000)
        preview = `data:image/png;base64,${b64}`
    }
  }
  return {
    name: str(j.name),
    size: pair(j.size),
    fov: num(j.fov),
    props: arr(j.props).length,
    faces,
    hasCleanPlate: j.clean !== undefined && j.clean !== null,
    preview,
  }
}

export interface ShotSummary {
  name?: string
  duration?: number
  set?: string
  cameraKeys: number
  lampKeys: number
  actors: Array<{ id: string; kind: string; keys: number; moves: number; lines: number }>
  /** Everything the shot says, other than actors, in one count: lines with audio. */
  spokenLines: number
}

export function summariseShot(data: Uint8Array): ShotSummary {
  const j = parse(data, 'rigstudio.shot', 'shot')
  const actors: ShotSummary['actors'] = arr(j.actors)
    .slice(0, 200)
    .filter(isObj)
    .map((a) => ({
      id: str(a.id, 60) ?? '?',
      kind: str(a.kind, 20) ?? 'actor',
      keys: arr(a.keys).length,
      moves: arr(a.moves).length,
      lines: arr(a.lines).length,
    }))
  return {
    name: str(j.name),
    duration: num(j.duration),
    set: baseName(str(j.set, 300)) || undefined,
    cameraKeys: arr(j.camera).length,
    lampKeys: arr(j.lamp).length,
    actors,
    spokenLines: actors.reduce((n, a) => n + a.lines, 0),
  }
}

/** "12.4 s" for short lengths, "1:05" from a minute up. */
export const seconds = (s: number | undefined) =>
  s === undefined
    ? undefined
    : s >= 60
      ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`
      : `${s.toFixed(1)} s`
