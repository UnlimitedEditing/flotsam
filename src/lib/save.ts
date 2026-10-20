import { Share } from '@capacitor/share'
import { isNative } from '../native/platform'
import { FlotsamNative } from '../native/plugin'

// Media is only ever fetched on an explicit user action (NSFW rule: nothing is cached or written
// to shared storage on its own).

function fileName(url: string): string {
  try {
    return decodeURIComponent(new URL(url).pathname.split('/').pop() || 'flotsam')
  } catch {
    return 'flotsam'
  }
}

/** Saves via a blob download; if the host blocks cross-origin reads, opens the URL so the user can save it. */
const MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  flac: 'audio/flac',
  m4a: 'audio/mp4',
  glb: 'model/gltf-binary',
  json: 'application/json',
  txt: 'text/plain',
}

/** Best-effort media type from a file name, for Android's MediaStore. */
export function mimeFromName(name: string): string {
  const ext = name.split('?')[0].split('.').pop()?.toLowerCase() ?? ''
  return MIME[ext] ?? 'application/octet-stream'
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

export async function downloadMedia(url: string): Promise<'saved' | 'opened'> {
  if (isNative()) {
    // Android: straight into the gallery (MediaStore), downloaded natively so it works for any result host.
    const name = fileName(url)
    try {
      await FlotsamNative.saveToGallery({ url, name, mime: mimeFromName(name) })
      return 'saved'
    } catch {
      window.open(url, '_blank', 'noopener')
      return 'opened'
    }
  }
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(String(res.status))
    const a = document.createElement('a')
    a.href = URL.createObjectURL(await res.blob())
    a.download = fileName(url)
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
    return 'saved'
  } catch {
    window.open(url, '_blank', 'noopener')
    return 'opened'
  }
}

export async function shareMedia(url: string): Promise<'shared' | 'copied' | 'failed'> {
  if (isNative()) {
    try {
      await Share.share({ url })
      return 'shared'
    } catch (e) {
      return /cancel/i.test((e as Error).message) ? 'shared' : 'failed'
    }
  }
  try {
    if (navigator.share) {
      await navigator.share({ url })
      return 'shared'
    }
    await navigator.clipboard.writeText(url)
    return 'copied'
  } catch (e) {
    return (e as Error).name === 'AbortError' ? 'shared' : 'failed'
  }
}

export function isVideo(url: string, mediaType?: string | null): boolean {
  return (mediaType ?? '').includes('video') || /\.(mp4|webm|mov)(\?|$)/i.test(url)
}

export function isAudio(url: string, mediaType?: string | null): boolean {
  return (mediaType ?? '').includes('audio') || /\.(mp3|wav|ogg|flac|m4a)(\?|$)/i.test(url)
}

/** Saves in-memory bytes (e.g. a decoded M3DS payload) as a file. Only runs on an explicit Save tap. */
export function saveBytes(filename: string, data: Uint8Array, mime = mimeFromName(filename)): void {
  if (isNative()) {
    void FlotsamNative.saveToGallery({ base64: bytesToBase64(data), name: filename, mime })
    return
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([data as BlobPart], { type: mime }))
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
}
