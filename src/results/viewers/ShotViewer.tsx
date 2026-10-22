import { useMemo } from 'react'
import { seconds, summariseShot, type ShotSummary } from '../../rig/summary'
import { ErrorNote, Facts, NoPlayerNote } from './SummaryParts'
import type { ViewerProps } from './types'

/** A shot (a staged scene), summarised: its length, set, and who and what is in it. */
export default function ShotViewer({ data }: ViewerProps) {
  const parsed = useMemo<{ s: ShotSummary } | { error: string }>(() => {
    try {
      return { s: summariseShot(data) }
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
          ['Name', s.name],
          ['Length', seconds(s.duration)],
          ['Set', s.set],
          ['Camera moves', s.cameraKeys ? `${s.cameraKeys} keys` : undefined],
          ['Light moves', s.lampKeys ? `${s.lampKeys} keys` : undefined],
          ['Spoken lines', s.spokenLines ? String(s.spokenLines) : undefined],
        ]}
      />
      {s.actors.length > 0 && (
        <>
          <h3 className="summary-h">In the shot</h3>
          <ul className="actors">
            {s.actors.map((a, i) => (
              <li key={`${a.id}-${i}`}>
                <strong>{a.id}</strong> <span className="pill">{a.kind}</span>
                <span className="muted">
                  {' '}
                  {a.keys} keys
                  {a.moves ? ` · ${a.moves} moves` : ''}
                  {a.lines ? ` · ${a.lines} lines` : ''}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      <NoPlayerNote what="shot" />
    </div>
  )
}
