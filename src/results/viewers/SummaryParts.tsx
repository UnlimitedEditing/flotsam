import type { ReactNode } from 'react'

/** A labelled list of facts, the common body of the read-only summaries. */
export function Facts({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <dl className="facts">
      {rows
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => (
          <div key={k} className="fact">
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
    </dl>
  )
}

/** What to say where a player would be: these files open for reading only until the staging tool exists. */
export function NoPlayerNote({ what }: { what: string }) {
  return (
    <p className="muted">
      This is a summary of the {what}. Playing and editing it will come with the staging tool; Save keeps the
      original file to open in Rig Studio.
    </p>
  )
}

export function ErrorNote({ message }: { message: string }) {
  return <p className="error">{message}</p>
}
