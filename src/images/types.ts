// Graydient has no upload endpoint: init images must be a URL it can fetch.
// Flotsam hosts nothing itself, so images reach a render in one of three ways.

/** What the user picked as an input image. */
export type ImageInput =
  | { kind: 'render'; url: string } // output of an earlier Graydient render (already public on their S3)
  | { kind: 'url'; url: string } // a URL the user pasted
  | { kind: 'file'; blob: Blob; name: string } // camera / gallery / share-in; needs an ImageHost

/** A place that can turn a local file into a public URL. Each is chosen and configured by the user. */
export interface ImageHost {
  id: string
  label: string
  /** Shown in settings so the user knows whose terms apply to what they upload. */
  termsUrl?: string
  upload(blob: Blob, name: string, signal?: AbortSignal): Promise<string>
}

export class NeedsImageHostError extends Error {
  constructor() {
    super('This image is a local file. Choose an image host in Settings, or paste a URL instead.')
  }
}

export class InvalidImageUrlError extends Error {}
