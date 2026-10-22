import { Suspense, useEffect, useState } from 'react'
import type { ResolvedMedia } from '../api/types'
import { saveBytes } from '../lib/save'
import {
  assemble,
  hasM3dsHeader,
  M3dsError,
  parseChunk,
  pngToRgb,
  progress,
  type Chunk,
  type Decoded,
} from '../m3ds/codec'
import { identifyPayload, mismatchNote, PAYLOAD_LABEL, type OutputSpec } from '../m3ds/registry'
import { renderViewer } from './registry'

type State =
  | { phase: 'loading'; step: string }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; decoded: Decoded }

const isPixelMedia = (m: ResolvedMedia) => !/\.(mp4|webm|mov|mp3|wav|ogg|flac|m4a)(\?|$)/i.test(m.url)

/** Reads the job's PNGs, collects the data chunks (a big file spans several images) and assembles them. */
async function decodeMedia(
  media: ResolvedMedia[],
  signal: AbortSignal,
  step: (s: string) => void,
): Promise<Decoded> {
  const chunks: Chunk[] = []
  const candidates = media.filter(isPixelMedia)
  for (let i = 0; i < candidates.length; i++) {
    step(`Reading image ${i + 1} of ${candidates.length}`)
    let blob: Blob
    try {
      const res = await fetch(candidates[i].url, { signal })
      if (!res.ok) throw new Error(String(res.status))
      blob = await res.blob()
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e
      throw new M3dsError('Could not download the image. The host may block reading it from this app.')
    }
    const rgb = await pngToRgb(blob)
    if (hasM3dsHeader(rgb)) chunks.push(parseChunk(rgb))
  }
  if (chunks.length === 0) throw new M3dsError('These images do not contain a result file.')
  const p = progress(chunks)
  if (p.have < p.need)
    throw new M3dsError(
      `Only ${p.have} of ${p.need} image parts were found. The rest are needed to open this file.`,
    )
  step('Unpacking')
  return assemble(chunks)
}

interface Props {
  /** Open a job's result images, or ... */
  media?: ResolvedMedia[]
  /** ... a file that is already decoded (an item from the library). */
  decoded?: Decoded
  spec: OutputSpec
  title?: string
  onClose: () => void
  /** Extra buttons for the bar (e.g. "Add to library"), given the decoded file. */
  actions?: (decoded: Decoded) => React.ReactNode
}

export default function ResultPanel({ media, decoded: given, spec, title, onClose, actions }: Props) {
  const [state, setState] = useState<State>(
    given ? { phase: 'ready', decoded: given } : { phase: 'loading', step: 'Starting' },
  )

  useEffect(() => {
    if (given || !media) return
    const ctl = new AbortController()
    if (spec.carrier !== 'm3ds') return
    decodeMedia(media, ctl.signal, (step) => setState({ phase: 'loading', step }))
      .then((decoded) => setState({ phase: 'ready', decoded }))
      .catch((e: Error) => {
        if (e.name !== 'AbortError') setState({ phase: 'error', message: e.message })
      })
    return () => ctl.abort()
  }, [media, given, spec.carrier])

  const decoded = state.phase === 'ready' ? state.decoded : null
  const kind = decoded ? identifyPayload(decoded.filename, decoded.data, spec.expect) : null
  const note = decoded && kind ? mismatchNote(spec.expect, kind, decoded.filename) : null

  return (
    <div className="lightbox result-panel" role="dialog" aria-modal="true">
      <div className="result-body">
        <h2 className="result-title">{title ?? (kind ? PAYLOAD_LABEL[kind].title : 'Result')}</h2>
        {spec.carrier === 'pixeldata' && (
          <p className="muted">
            This result uses the pixel-data image format (JSON written straight into pixels). Flotsam cannot
            open that format yet.
          </p>
        )}
        {spec.carrier === 'm3ds' && state.phase === 'loading' && <p className="muted">{state.step}…</p>}
        {state.phase === 'error' && <p className="error">{state.message}</p>}
        {decoded && kind && (
          <>
            {note && <p className="muted">{note}</p>}
            {decoded.chunks > 1 && <p className="muted">Assembled from {decoded.chunks} images.</p>}
            <Suspense fallback={<p className="muted">Loading viewer…</p>}>
              {renderViewer(kind, {
                filename: decoded.filename,
                data: decoded.data,
                host: { title: title ?? PAYLOAD_LABEL[kind].title, close: onClose },
              })}
            </Suspense>
          </>
        )}
      </div>
      <div className="lb-bar glass">
        {decoded && actions?.(decoded)}
        {decoded && (
          <button className="ghost" onClick={() => saveBytes(decoded.filename, decoded.data)}>
            Save {decoded.filename.length > 24 ? 'file' : decoded.filename}
          </button>
        )}
        <button className="ghost" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}
