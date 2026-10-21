// A `rigstudio.direction` v1 sheet: the transcript of a spoken piece with the delivery chosen for each line.
// Validated on read because it arrives from the network; only the fields the viewer shows are kept.

export interface DirectionLine {
  i: number
  t0: number
  t1: number
  text: string
  delivery: string
  intensity: string | null
  locked: boolean
}

export interface DirectionSheet {
  version: number
  duration: number | null
  brief: string
  sentences: DirectionLine[]
}

const MAX_BYTES = 8 * 1024 * 1024
const MAX_LINES = 20000
const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const num = (v: unknown, fallback = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback)
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '')

export function parseDirection(data: Uint8Array): DirectionSheet {
  if (data.length > MAX_BYTES) throw new Error('This direction sheet is too large to open.')
  let raw: unknown
  try {
    raw = JSON.parse(new TextDecoder().decode(data))
  } catch {
    throw new Error('This is not a readable direction sheet.')
  }
  if (!isObj(raw) || raw.format !== 'rigstudio.direction') throw new Error('This is not a direction sheet.')
  if (!Array.isArray(raw.sentences)) throw new Error('The direction sheet has no lines.')
  if (raw.sentences.length > MAX_LINES) throw new Error('The direction sheet has too many lines.')
  const sentences: DirectionLine[] = raw.sentences.filter(isObj).map((s, k) => ({
    i: Number.isInteger(s.i) ? (s.i as number) : k,
    t0: num(s.t0),
    t1: num(s.t1),
    text: str(s.text, 600),
    delivery: str(s.delivery, 30) || 'neutral',
    intensity: typeof s.intensity === 'string' ? str(s.intensity, 12) : null,
    locked: s.locked === true,
  }))
  const audio = isObj(raw.audio) ? raw.audio : {}
  return {
    version: num(raw.version, 1),
    duration: typeof audio.duration === 'number' && Number.isFinite(audio.duration) ? audio.duration : null,
    brief: str(raw.brief, 400),
    sentences,
  }
}
