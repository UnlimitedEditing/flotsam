import type { ViewerProps } from './types'

function head(data: Uint8Array): string {
  return [...data.subarray(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join(' ')
}

/** Fallback for payload types that have no viewer yet (2D rig content, video projects, PLY splats...). */
export default function FileInfo({ filename, data }: ViewerProps) {
  return (
    <div className="info-wrap">
      <p>
        <strong>{filename}</strong>
      </p>
      <p className="muted">{data.length.toLocaleString()} bytes</p>
      <p className="muted">First bytes: {head(data)}</p>
      <p className="muted">
        Flotsam has no viewer for this file type yet. Use Save to keep the original file and open it in the
        matching app.
      </p>
    </div>
  )
}
