// M3DS container decoder: a TypeScript port of D:\tripostl\studio\m3ds_codec.py and unsmuggle.html.
//
// Graydient jobs return images, so Meshsmuggler packs arbitrary files into PNG pixels. Layout of the flat
// RGB pixel buffer (row-major, 3 bytes per pixel):
//   40-byte header  >4s B B H H Q I I Q I H
//     magic "M3DS", version (1), flags (bit0 = gzip), chunk index, chunk count, blob_total,
//     payload length, payload CRC32, original length, original CRC32, filename length
//   filename (UTF-8), then the payload (this chunk's slice of the possibly gzipped blob).
// A file larger than one image is split across several PNGs ("chunks"); all must be present to decode.

export const MAGIC = 'M3DS'
export const HEADER_SIZE = 40
export const FLAG_GZIP = 0x01

export class M3dsError extends Error {}

export interface Chunk {
  flags: number
  index: number
  count: number
  blobTotal: number
  payLen: number
  payCrc: number
  origLen: number
  origCrc: number
  filename: string
  payload: Uint8Array
}

export interface Decoded {
  filename: string
  data: Uint8Array
  chunks: number
}

let table: Uint32Array | null = null
export function crc32(data: Uint8Array): number {
  if (!table) {
    table = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      table[n] = c >>> 0
    }
  }
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

export function hasM3dsHeader(rgb: Uint8Array): boolean {
  return rgb.length >= HEADER_SIZE && String.fromCharCode(rgb[0], rgb[1], rgb[2], rgb[3]) === MAGIC
}

/** Parses and validates one chunk from a flat RGB buffer. Throws M3dsError with a readable reason. */
export function parseChunk(rgb: Uint8Array): Chunk {
  if (rgb.length < HEADER_SIZE) throw new M3dsError('Image too small to contain an M3DS header')
  if (!hasM3dsHeader(rgb)) throw new M3dsError('Not an M3DS image')
  const view = new DataView(rgb.buffer, rgb.byteOffset, rgb.byteLength)
  const version = rgb[4]
  if (version !== 1) throw new M3dsError(`Unsupported M3DS container version: ${version}`)
  const flags = rgb[5]
  const index = view.getUint16(6, false)
  const count = view.getUint16(8, false)
  const blobTotal = Number(view.getBigUint64(10, false))
  const payLen = view.getUint32(18, false)
  const payCrc = view.getUint32(22, false)
  const origLen = Number(view.getBigUint64(26, false))
  const origCrc = view.getUint32(34, false)
  const fnameLen = view.getUint16(38, false)

  const fnameEnd = HEADER_SIZE + fnameLen
  const filename = new TextDecoder().decode(rgb.subarray(HEADER_SIZE, fnameEnd))
  const payload = rgb.slice(fnameEnd, fnameEnd + payLen)
  if (payload.length !== payLen)
    throw new M3dsError(`Payload truncated (${payload.length} of ${payLen} bytes)`)
  if (crc32(payload) !== payCrc) {
    throw new M3dsError('Chunk CRC mismatch: the image was re-compressed or altered after export')
  }
  return { flags, index, count, blobTotal, payLen, payCrc, origLen, origCrc, filename, payload }
}

export async function gunzip(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** Identifies which container a chunk belongs to, so unrelated images are never mixed. */
export const chunkKey = (c: Chunk) => `${c.filename}|${c.origLen}|${c.origCrc}`

export interface Progress {
  have: number
  need: number
}

/** True when every chunk of the container is present. */
export function progress(chunks: Chunk[]): Progress {
  const first = chunks[0]
  const have = new Set(chunks.filter((c) => chunkKey(c) === chunkKey(first)).map((c) => c.index)).size
  return { have, need: first?.count ?? 0 }
}

/** Reassembles one container from its chunks (any order, duplicates ignored). */
export async function assemble(chunks: Chunk[]): Promise<Decoded> {
  if (chunks.length === 0) throw new M3dsError('No chunks to assemble')
  const key = chunkKey(chunks[0])
  const byIndex = new Map<number, Chunk>()
  for (const c of chunks) if (chunkKey(c) === key) byIndex.set(c.index, c)
  const first = chunks[0]
  if (byIndex.size !== first.count) {
    throw new M3dsError(`${byIndex.size} of ${first.count} chunks present; the remaining image(s) are needed`)
  }
  const ordered: Chunk[] = []
  for (let i = 0; i < first.count; i++) {
    const c = byIndex.get(i)
    if (!c) throw new M3dsError(`Chunk ${i} is missing`)
    ordered.push(c)
  }
  const blob = new Uint8Array(ordered.reduce((n, c) => n + c.payload.length, 0))
  let at = 0
  for (const c of ordered) {
    blob.set(c.payload, at)
    at += c.payload.length
  }
  if (blob.length !== first.blobTotal) {
    throw new M3dsError(`Assembled size mismatch: ${blob.length} vs ${first.blobTotal}`)
  }
  let data: Uint8Array
  try {
    data = first.flags & FLAG_GZIP ? await gunzip(blob) : blob
  } catch {
    throw new M3dsError('Could not decompress the container (corrupt data)')
  }
  if (data.length !== first.origLen)
    throw new M3dsError(`Decompressed size mismatch: ${data.length} vs ${first.origLen}`)
  if (crc32(data) !== first.origCrc)
    throw new M3dsError('Final CRC mismatch: the container was altered in transit')
  return { filename: first.filename || 'mesh.glb', data, chunks: first.count }
}

/** Reads a PNG's pixels as a flat RGB buffer (alpha dropped). Browser only. */
export async function pngToRgb(png: Blob): Promise<Uint8Array> {
  const bmp = await createImageBitmap(png, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' })
  const canvas = document.createElement('canvas')
  canvas.width = bmp.width
  canvas.height = bmp.height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new M3dsError('Canvas unavailable')
  ctx.drawImage(bmp, 0, 0)
  bmp.close()
  const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data
  const rgb = new Uint8Array((rgba.length / 4) * 3)
  for (let i = 0, j = 0; i < rgba.length; i += 4, j += 3) {
    rgb[j] = rgba[i]
    rgb[j + 1] = rgba[i + 1]
    rgb[j + 2] = rgba[i + 2]
  }
  return rgb
}
