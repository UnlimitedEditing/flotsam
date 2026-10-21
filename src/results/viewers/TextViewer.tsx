import { useMemo, useState } from 'react'
import type { ViewerProps } from './types'

const LIMIT = 200_000

export default function TextViewer({ filename, data }: ViewerProps) {
  const [wrap, setWrap] = useState(true)
  const { text, note } = useMemo(() => {
    let t = new TextDecoder('utf-8', { fatal: false }).decode(data)
    let n = ''
    if (/\.json$/i.test(filename) || /^[\s]*[{[]/.test(t)) {
      try {
        t = JSON.stringify(JSON.parse(t), null, 2)
        n = 'Formatted JSON'
      } catch {
        /* not JSON: show as is */
      }
    }
    if (t.length > LIMIT) {
      n = `Showing the first ${LIMIT.toLocaleString()} of ${t.length.toLocaleString()} characters. Save the file for the rest.`
      t = t.slice(0, LIMIT)
    }
    return { text: t, note: n }
  }, [filename, data])

  return (
    <div className="text-wrap">
      <div className="row">
        <button className="ghost small" onClick={() => setWrap(!wrap)}>
          {wrap ? 'No wrap' : 'Wrap'}
        </button>
        <span className="muted">{note}</span>
      </div>
      <pre className={`textview${wrap ? ' wrap' : ''}`}>{text}</pre>
    </div>
  )
}
