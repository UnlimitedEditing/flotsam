import { InvalidImageUrlError, NeedsImageHostError, type ImageHost, type ImageInput } from './types'

/**
 * Graydient dereferences init_image itself, so the URL must be a raw http(s) URL (not percent-encoded,
 * not an HTML page that merely embeds the image: see ForgeExpress docs/render-quality-notes.md).
 * We can only check the first two cheaply here.
 */
export function assertFetchableUrl(value: string): string {
  const trimmed = value.trim()
  let u: URL
  try {
    u = new URL(trimmed)
  } catch {
    throw new InvalidImageUrlError('Not a valid URL')
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new InvalidImageUrlError('URL must be http(s)')
  if (/%2F|%3A/i.test(trimmed)) throw new InvalidImageUrlError('URL must not be percent-encoded')
  return trimmed
}

/** Turns any ImageInput into the URL to send as init_image. Files need a configured host. */
export async function resolveImage(
  input: ImageInput,
  host?: ImageHost,
  signal?: AbortSignal,
): Promise<string> {
  switch (input.kind) {
    case 'render':
    case 'url':
      return assertFetchableUrl(input.url)
    case 'file': {
      if (!host) throw new NeedsImageHostError()
      return assertFetchableUrl(await host.upload(input.blob, input.name, signal))
    }
  }
}
