import { useMemo } from 'react'
import { parseDirection, type DirectionSheet } from '../../rig/direction'
import type { ViewerProps } from './types'

const clock = (s: number) =>
  `${Math.floor(s / 60)}:${Math.floor(s % 60)
    .toString()
    .padStart(2, '0')}`
const SHOWN = 400

/** A direction sheet, readable: each spoken line with the delivery it was given. Editing stays in Sheet Studio. */
export default function DirectionViewer({ data }: ViewerProps) {
  const parsed = useMemo<{ sheet: DirectionSheet } | { error: string }>(() => {
    try {
      return { sheet: parseDirection(data) }
    } catch (e) {
      return { error: (e as Error).message }
    }
  }, [data])
  if ('error' in parsed) return <p className="error">{parsed.error}</p>

  const { sheet } = parsed
  const counts = new Map<string, number>()
  for (const l of sheet.sentences) counts.set(l.delivery, (counts.get(l.delivery) ?? 0) + 1)
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])
  const locked = sheet.sentences.filter((l) => l.locked).length

  return (
    <div className="direction-viewer">
      <p className="muted">
        {sheet.sentences.length} lines
        {sheet.duration ? ` · ${clock(sheet.duration)}` : ''}
        {locked ? ` · ${locked} locked by you` : ''}
      </p>
      {sheet.brief && <p className="dir-brief">“{sheet.brief}”</p>}
      {top.length > 0 && (
        <div className="chip-row" aria-label="Deliveries used">
          {top.slice(0, 8).map(([d, n]) => (
            <span key={d} className="pill">
              {d} · {n}
            </span>
          ))}
        </div>
      )}
      <ol className="dir-lines">
        {sheet.sentences.slice(0, SHOWN).map((l) => (
          <li key={l.i} className="dir-line">
            <span className="dir-time">{clock(l.t0)}</span>
            <span className="dir-text">{l.text}</span>
            <span className="dir-tags">
              <span className="pill">{l.delivery}</span>
              {l.intensity && <span className="pill">{l.intensity}</span>}
              {l.locked && <span className="pill">locked</span>}
            </span>
          </li>
        ))}
      </ol>
      {sheet.sentences.length > SHOWN && (
        <p className="muted">
          Showing the first {SHOWN} of {sheet.sentences.length} lines. Save the file for the rest.
        </p>
      )}
    </div>
  )
}
