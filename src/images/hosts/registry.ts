import { getApiKey } from '../../api/storage'
import { getPrefs } from '../../state/prefs'
import type { ImageHost } from '../types'
import { catboxHost } from './catbox'

/** The image host the user chose in Settings, or undefined when none is configured. */
export function getImageHost(): ImageHost | undefined {
  const p = getPrefs()
  if (p.imageHost === 'catbox') return catboxHost({ userhash: p.catboxUserhash, apiKey: getApiKey() })
  return undefined
}

/** 1x1 PNG used by Settings > Test upload, so a test never sends one of the user's own images. */
export async function makeTestPng(): Promise<Blob> {
  const c = document.createElement('canvas')
  c.width = c.height = 1
  c.getContext('2d')?.fillRect(0, 0, 1, 1)
  return new Promise((resolve, reject) =>
    c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not create test image'))), 'image/png'),
  )
}

/** True if the URL loads as an image. Uses an <img> so no CORS permission is needed. */
export function imageLoads(url: string, timeoutMs = 15_000): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image()
    const t = setTimeout(() => resolve(false), timeoutMs)
    img.onload = () => {
      clearTimeout(t)
      resolve(true)
    }
    img.onerror = () => {
      clearTimeout(t)
      resolve(false)
    }
    img.src = url
  })
}
