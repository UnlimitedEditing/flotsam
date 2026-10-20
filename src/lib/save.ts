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
export async function downloadMedia(url: string): Promise<'saved' | 'opened'> {
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
export function saveBytes(filename: string, data: Uint8Array, mime = 'application/octet-stream'): void {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([data as BlobPart], { type: mime }))
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
}
