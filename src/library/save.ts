import type { Decoded } from '../m3ds/codec'
import { identifyPayload, type Expect, type PayloadKind } from '../m3ds/registry'
import { parsePuppetBundle } from '../rig/puppet'
import { addToLibrary, LibraryError, LIMITS, type LibraryItem, type LibraryKind } from './store'

const KIND_OF: Record<PayloadKind, LibraryKind> = {
  model: 'model',
  text: 'text',
  score: 'score',
  puppet: 'puppet',
  direction: 'direction',
  track: 'track',
  set: 'set',
  shot: 'shot',
  unknown: 'other',
}

export const KIND_LABEL: Record<LibraryKind, string> = {
  puppet: 'Puppet',
  direction: 'Direction sheet',
  track: 'Performance track',
  set: 'Set',
  shot: 'Shot',
  model: '3D model',
  text: 'Text',
  score: 'Song score',
  image: 'Image',
  other: 'File',
}

export const KIND_ICON = {
  puppet: 'puppet',
  direction: 'doc',
  track: 'doc',
  set: 'cube',
  shot: 'cube',
  model: 'cube',
  text: 'doc',
  score: 'music',
  image: 'gallery',
  other: 'doc',
} as const

export const formatBytes = (n: number) =>
  n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`

/** A small square preview as a data URL (cover-cropped). Undefined where the browser cannot make one. */
export async function thumbFromBlob(blob: Blob, size = 160): Promise<string | undefined> {
  try {
    const bmp = await createImageBitmap(blob)
    const cv = document.createElement('canvas')
    cv.width = cv.height = size
    const g = cv.getContext('2d')
    if (!g) return undefined
    const s = Math.max(size / bmp.width, size / bmp.height)
    const w = bmp.width * s
    const h = bmp.height * s
    g.fillStyle = '#fbfaf7'
    g.fillRect(0, 0, size, size)
    g.drawImage(bmp, (size - w) / 2, (size - h) / 2, w, h)
    bmp.close?.()
    return cv.toDataURL('image/jpeg', 0.72)
  } catch {
    return undefined
  }
}

const stem = (filename: string) => filename.replace(/\.[^.]+$/, '').replace(/[._-]+/g, ' ')

/** Saves a decoded result file (puppet, sheet, model, ...) to the library. The user asked for this. */
export async function saveDecodedToLibrary(
  decoded: Decoded,
  opts: { expect?: Expect; nsfw?: boolean; sourceJobId?: string; name?: string } = {},
): Promise<LibraryItem> {
  const payload = identifyPayload(decoded.filename, decoded.data, opts.expect ?? 'unknown')
  const kind = KIND_OF[payload]
  let name = opts.name || stem(decoded.filename)
  let thumb: string | undefined
  if (payload === 'puppet') {
    try {
      const bundle = parsePuppetBundle(decoded.data) // validated before it is kept
      name = opts.name || bundle.name
      const base = await (await fetch('data:image/png;base64,' + bundle.files[bundle.base])).blob()
      thumb = await thumbFromBlob(base)
    } catch (e) {
      throw new LibraryError((e as Error).message)
    }
  }
  return addToLibrary({
    kind,
    name,
    filename: decoded.filename,
    bytes: decoded.data,
    thumb,
    nsfw: opts.nsfw,
    sourceJobId: opts.sourceJobId,
  })
}

/** Saves an image result to the library (fetches it once; the host must allow reading it from this app). */
export async function saveImageToLibrary(
  url: string,
  opts: { nsfw?: boolean; sourceJobId?: string; name?: string } = {},
): Promise<LibraryItem> {
  let blob: Blob
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(String(res.status))
    blob = await res.blob()
  } catch {
    throw new LibraryError('Could not read that image. The host may block saving it from this app.')
  }
  if (!blob.type.startsWith('image/')) throw new LibraryError('That is not an image.')
  if (blob.size > LIMITS.item) throw new LibraryError('That image is too large for the library.')
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const ext = blob.type.split('/')[1]?.replace('jpeg', 'jpg') ?? 'png'
  return addToLibrary({
    kind: 'image',
    name: opts.name || `Image ${new Date().toISOString().slice(0, 10)}`,
    filename: `image.${ext}`,
    bytes,
    thumb: await thumbFromBlob(blob),
    nsfw: opts.nsfw,
    sourceJobId: opts.sourceJobId,
  })
}
