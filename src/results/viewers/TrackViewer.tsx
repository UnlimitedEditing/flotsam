import { useMemo } from 'react'
import { seconds, summariseTrack, type TrackSummary } from '../../rig/summary'
import { ErrorNote, Facts, NoPlayerNote } from './SummaryParts'
import type { ViewerProps } from './types'

/** A performance track (animation curves), summarised: length, who it is for, which expressions move most. */
export default function TrackViewer({ data }: ViewerProps) {
  const parsed = useMemo<{ s: TrackSummary } | { error: string }>(() => {
    try {
      return { s: summariseTrack(data) }
    } catch (e) {
      return { error: (e as Error).message }
    }
  }, [data])
  if ('error' in parsed) return <ErrorNote message={parsed.error} />
  const { s } = parsed
  return (
    <div className="summary">
      <Facts
        rows={[
          ['Length', seconds(s.duration)],
          ['Frames', s.frames !== undefined && s.fps ? `${s.frames} at ${s.fps} per second` : s.frames],
          ['For', s.role],
          ['From', s.source],
          ['Mouth shapes', s.visemes ? s.visemes.toLocaleString() : undefined],
          ['Events', s.events ? s.events.toLocaleString() : undefined],
        ]}
      />
      {s.layers.length > 0 && (
        <div className="chip-row" aria-label="Layers">
          {s.layers.map((l) => (
            <span key={l.name} className="pill">
              {l.name} · {l.channels} channels{l.blend ? ` · ${l.blend}` : ''}
            </span>
          ))}
        </div>
      )}
      {s.active.length > 0 && (
        <>
          <h3 className="summary-h">Most active expressions</h3>
          <ul className="bars">
            {s.active.map(([name, peak]) => (
              <li key={name}>
                <span>{name}</span>
                <span className="bar" role="img" aria-label={`peak ${Math.round(peak * 100)} per cent`}>
                  <i style={{ width: `${Math.min(100, Math.round(peak * 100))}%` }} />
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      <NoPlayerNote what="performance track" />
    </div>
  )
}
