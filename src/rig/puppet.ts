// A `rigstudio.puppet` v2 bundle: a part-based talking-head puppet, as JSON with every layer inlined as base64 PNG
// (it travels inside an image, see src/m3ds/codec.ts). Bundles come from the network, so they are validated
// before anything is decoded or drawn: shape, sizes, file names, and that every layer really is a PNG.

export type Box = [number, number, number, number]

export interface PuppetPart {
  box: Box
  frames: Record<string, string> // frame key -> layer file
  rest?: string
  speech?: string[] // mouth: the speech shapes (A-H)
  idle?: string[] // mouth: the resting expressions
  pupils?: Record<string, string> // eyes: frame key -> clip file, or "baked"
}

export interface PuppetPupil {
  side: string
  file: string
  box: Box
  range: [number, number]
}

export interface PuppetBundle {
  format: 'rigstudio.puppet'
  version: number
  name: string
  size: [number, number]
  base: string
  parts: Record<string, PuppetPart>
  pupils: PuppetPupil[]
  draw_order: string[]
  files: Record<string, string> // layer file -> base64 PNG
}

export class PuppetError extends Error {}

export const LIMITS = {
  json: 48 * 1024 * 1024,
  dimension: 4096,
  files: 300,
  fileBase64: 12 * 1024 * 1024,
}

const PNG_B64 = 'iVBORw0KGgo' // base64 of the PNG signature
const FILE_NAME = /^[A-Za-z0-9_.-]{1,80}$/
const PART_NAME = /^[A-Za-z0-9_]{1,24}$/

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v)
const isInt = (v: unknown, max = LIMITS.dimension): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= max

function box(v: unknown, where: string, w: number, h: number): Box {
  if (!Array.isArray(v) || v.length !== 4 || !v.every((n) => isInt(n)))
    throw new PuppetError(`${where}: the box is not four whole numbers`)
  const b = v as Box
  if (b[2] <= b[0] || b[3] <= b[1] || b[2] > w || b[3] > h)
    throw new PuppetError(`${where}: the box is outside the puppet`)
  return b
}

export function parsePuppetBundle(data: Uint8Array): PuppetBundle {
  if (data.length > LIMITS.json) throw new PuppetError('This puppet file is too large to open.')
  let raw: unknown
  try {
    raw = JSON.parse(new TextDecoder().decode(data))
  } catch {
    throw new PuppetError('This is not a readable puppet file.')
  }
  if (!isObj(raw) || raw.format !== 'rigstudio.puppet')
    throw new PuppetError('This is not a Rig Studio puppet.')
  if (typeof raw.version !== 'number' || raw.version < 2)
    throw new PuppetError('Only part-based (version 2) puppets can be opened.')
  const size = raw.size
  if (!Array.isArray(size) || size.length !== 2 || !isInt(size[0]) || !isInt(size[1]) || !size[0] || !size[1])
    throw new PuppetError('The puppet has no valid size.')
  const [W, H] = size as [number, number]

  const files = raw.files
  if (!isObj(files)) throw new PuppetError('The puppet has no image layers.')
  const names = Object.keys(files)
  if (names.length === 0 || names.length > LIMITS.files)
    throw new PuppetError('The puppet has an unusual number of layers.')
  for (const n of names) {
    const b64 = files[n]
    if (!FILE_NAME.test(n)) throw new PuppetError(`A layer has an unsafe name.`)
    if (typeof b64 !== 'string' || b64.length > LIMITS.fileBase64 || !b64.startsWith(PNG_B64))
      throw new PuppetError(`Layer ${n} is not a PNG image.`)
  }
  const has = (f: unknown, where: string): string => {
    if (typeof f !== 'string' || !Object.prototype.hasOwnProperty.call(files, f))
      throw new PuppetError(`${where} refers to a layer that is not in the file.`)
    return f
  }

  const base = has(raw.base, 'The base image')
  if (!isObj(raw.parts)) throw new PuppetError('The puppet has no parts.')
  const parts: Record<string, PuppetPart> = {}
  for (const [name, p] of Object.entries(raw.parts)) {
    if (!PART_NAME.test(name) || !isObj(p)) throw new PuppetError('A puppet part is malformed.')
    if (!isObj(p.frames) || Object.keys(p.frames).length === 0)
      throw new PuppetError(`Part ${name} has no frames.`)
    const frames: Record<string, string> = {}
    for (const [k, f] of Object.entries(p.frames)) frames[k] = has(f, `Part ${name}`)
    const part: PuppetPart = { box: box(p.box, `Part ${name}`, W, H), frames }
    if (typeof p.rest === 'string') part.rest = p.rest
    if (Array.isArray(p.speech)) part.speech = p.speech.filter((s): s is string => typeof s === 'string')
    if (Array.isArray(p.idle)) part.idle = p.idle.filter((s): s is string => typeof s === 'string')
    if (isObj(p.pupils)) {
      part.pupils = {}
      for (const [k, f] of Object.entries(p.pupils)) {
        if (f === 'baked') part.pupils[k] = 'baked'
        else part.pupils[k] = has(f, `Part ${name}`)
      }
    }
    parts[name] = part
  }
  if (!parts.mouth || !parts.eyes) throw new PuppetError('The puppet needs at least a mouth and eyes.')

  const pupils: PuppetPupil[] = []
  if (Array.isArray(raw.pupils))
    for (const q of raw.pupils) {
      if (
        !isObj(q) ||
        !Array.isArray(q.range) ||
        q.range.length !== 2 ||
        !q.range.every((n) => typeof n === 'number')
      )
        throw new PuppetError('A pupil is malformed.')
      pupils.push({
        side: String(q.side ?? ''),
        file: has(q.file, 'A pupil'),
        box: box(q.box, 'A pupil', W, H),
        range: [q.range[0] as number, q.range[1] as number],
      })
    }

  const order = Array.isArray(raw.draw_order)
    ? raw.draw_order
    : ['eyes', 'pupils', 'brow_L', 'brow_R', 'mouth']
  const draw_order = order.filter((n): n is string => typeof n === 'string' && (n === 'pupils' || n in parts))

  return {
    format: 'rigstudio.puppet',
    version: raw.version,
    name: typeof raw.name === 'string' ? raw.name.slice(0, 80) : 'puppet',
    size: [W, H],
    base,
    parts,
    pupils,
    draw_order,
    files: files as Record<string, string>,
  }
}
