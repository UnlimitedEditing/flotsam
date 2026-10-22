import { useMemo } from 'react'
import { summariseSet, type SetSummary } from '../../rig/summary'
import { ErrorNote, Facts, NoPlayerNote } from './SummaryParts'
import type { ViewerProps } from './types'

const dims = (v: [number, number] | undefined) => (v ? `${v[0]} × ${v[1]}` : undefined)

/** A built room (a set), summarised, with its back wall as a picture. */
export default function SetViewer({ data }: ViewerProps) {
  const parsed = useMemo<{ s: SetSummary } | { error: string }>(() => {
    try {
      return { s: summariseSet(data) }
    } catch (e) {
      return { error: (e as Error).message }
    }
  }, [data])
  if ('error' in parsed) return <ErrorNote message={parsed.error} />
  const { s } = parsed
  return (
    <div className="summary">
      {s.preview && (
        <img className="summary-img" src={s.preview} alt={`Back wall of ${s.name ?? 'the set'}`} />
      )}
      <Facts
        rows={[
          ['Name', s.name],
          ['Picture size', dims(s.size)],
          ['Field of view', s.fov !== undefined ? `${s.fov}°` : undefined],
          ['Props', s.props ? String(s.props) : 'none'],
          ['Clean plate', s.hasCleanPlate ? 'yes' : 'no'],
        ]}
      />
      {s.faces.length > 0 && (
        <div className="chip-row" aria-label="Faces of the room">
          {s.faces.map((f) => (
            <span key={f.name} className="pill">
              {f.name}
              {f.size ? ` · ${dims(f.size)}` : ''}
            </span>
          ))}
        </div>
      )}
      <NoPlayerNote what="set" />
    </div>
  )
}
