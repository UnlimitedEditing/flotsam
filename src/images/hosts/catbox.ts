import type { ImageHost } from '../types'

// Catbox accepts anonymous uploads, or uploads tied to the uploader's own account via their `userhash`
// (self-registered at catbox.moe). Browsers cannot call it directly (no CORS headers), so:
//  - dev: Vite proxies /catbox -> catbox.moe/user/api.php
//  - PWA: VITE_CATBOX_ENDPOINT points at the Worker relay (https://<worker>/upload/catbox)
//  - Android (Capacitor): can call Catbox directly with native HTTP (Phase 4)
export const CATBOX_DIRECT = 'https://catbox.moe/user/api.php'
const ENDPOINT =
  (import.meta.env.VITE_CATBOX_ENDPOINT as string | undefined) ??
  (import.meta.env.DEV ? '/catbox' : CATBOX_DIRECT)
const RESULT_URL = /^https:\/\/files\.catbox\.moe\/\S+$/

export interface CatboxOptions {
  userhash?: string
  endpoint?: string
  /** Graydient API key, sent ONLY to the Flotsam relay (never to Catbox) so the relay can reject strangers. */
  apiKey?: string
}

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

function uploadName(blob: Blob, name: string): string {
  const base = name.replace(/\.[^.]+$/, '') || 'image'
  const ext = EXT[blob.type] ?? name.split('.').pop() ?? 'bin'
  return `${base}.${ext}`
}

export function catboxHost(opts: CatboxOptions = {}): ImageHost {
  const endpoint = opts.endpoint ?? ENDPOINT
  const viaRelay = endpoint !== CATBOX_DIRECT && !endpoint.startsWith('/catbox')
  return {
    id: 'catbox',
    label: 'Catbox',
    termsUrl: 'https://catbox.moe/',
    async upload(blob, name, signal) {
      const form = new FormData()
      form.set('reqtype', 'fileupload')
      if (opts.userhash?.trim()) form.set('userhash', opts.userhash.trim())
      form.set('fileToUpload', blob, uploadName(blob, name))
      let res: Response
      try {
        res = await fetch(endpoint, {
          method: 'POST',
          body: form,
          signal,
          headers: viaRelay && opts.apiKey ? { Authorization: `Bearer ${opts.apiKey}` } : undefined,
        })
      } catch (e) {
        if ((e as Error).name === 'AbortError') throw e
        throw new Error(`Could not reach the upload service: ${(e as Error).message}`)
      }
      const text = (await res.text()).trim()
      if (!res.ok || !RESULT_URL.test(text)) {
        throw new Error(`Upload failed (${res.status}): ${text.slice(0, 140) || 'no response'}`)
      }
      return text
    },
  }
}
