import { useEffect, useRef, useState } from 'react'
import { saveBytes } from '../../lib/save'
import { loadMessage, parseFrameMessage } from '../frame/bridge'
import TextViewer from './TextViewer'
import type { ViewerProps } from './types'

// The song score opens in the Groove Box "Score Studio": our own vendored copy under /viewers/groovebox/, in a
// sandboxed same-origin iframe (docs/viewers.md, "the frame mode"). The page loads nothing from the internet by
// itself; instrument sounds are downloaded only after the user taps Allow inside it.

const SRC = `${import.meta.env.BASE_URL}viewers/groovebox/studio.html`
const START_TIMEOUT_MS = 12_000

type Phase = 'starting' | 'loading' | 'ready' | 'error'

export default function ScoreViewer({ filename, data }: ViewerProps) {
  const frame = useRef<HTMLIFrameElement>(null)
  const [phase, setPhase] = useState<Phase>('starting')
  const [message, setMessage] = useState('')
  const [json, setJson] = useState(false)

  useEffect(() => {
    const origin = window.location.origin
    const onMessage = (ev: MessageEvent) => {
      const m = parseFrameMessage(ev, frame.current?.contentWindow, origin)
      if (!m) return
      if (m.type === 'hello') {
        const msg = loadMessage(filename, data)
        setPhase('loading')
        frame.current?.contentWindow?.postMessage(msg, origin, [msg.bytes])
      } else if (m.type === 'loaded') setPhase('ready')
      else if (m.type === 'error') {
        setMessage(m.message)
        setPhase('error')
      } else if (m.type === 'save') saveBytes(m.filename, new Uint8Array(m.bytes), 'image/png')
    }
    window.addEventListener('message', onMessage)
    const timer = window.setTimeout(() => {
      setPhase((p) => {
        if (p !== 'starting') return p
        setMessage('The score player did not start. It needs a connection the first time it is opened.')
        return 'error'
      })
    }, START_TIMEOUT_MS)
    return () => {
      window.removeEventListener('message', onMessage)
      window.clearTimeout(timer)
    }
  }, [filename, data])

  return (
    <div className="frame-viewer">
      <div className="row">
        <button className="ghost small" onClick={() => setJson(!json)}>
          {json ? 'Back to the player' : 'View JSON'}
        </button>
        {phase === 'starting' && <span className="muted">Starting the score player…</span>}
        {phase === 'loading' && <span className="muted">Opening the score…</span>}
      </div>
      {phase === 'error' && <p className="error">{message}</p>}
      {json ? (
        <TextViewer filename={filename} data={data} />
      ) : (
        <iframe
          ref={frame}
          title="Song score player"
          src={SRC}
          sandbox="allow-scripts allow-same-origin"
          referrerPolicy="no-referrer"
          className="frame-view"
        />
      )}
    </div>
  )
}
