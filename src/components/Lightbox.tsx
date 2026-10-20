import { useState } from 'react'
import type { ResolvedMedia } from '../api/types'
import { downloadMedia, isAudio, isVideo, shareMedia } from '../lib/save'

interface Props {
  items: ResolvedMedia[]
  index: number
  onClose: () => void
  onUseAsInput?: (url: string) => void
  onDelete?: () => void
}

export default function Lightbox({ items, index, onClose, onUseAsInput, onDelete }: Props) {
  const [i, setI] = useState(index)
  const [note, setNote] = useState('')
  const m = items[i]
  if (!m) return null

  const flash = (s: string) => {
    setNote(s)
    setTimeout(() => setNote(''), 2500)
  }

  return (
    <div className="lightbox" role="dialog" aria-modal="true">
      <div className="lb-body" onClick={onClose}>
        {isVideo(m.url, m.mediaType) ? (
          <video src={m.url} controls autoPlay loop playsInline onClick={(e) => e.stopPropagation()} />
        ) : isAudio(m.url, m.mediaType) ? (
          <audio src={m.url} controls onClick={(e) => e.stopPropagation()} />
        ) : (
          <img src={m.url} alt="" referrerPolicy="no-referrer" onClick={(e) => e.stopPropagation()} />
        )}
      </div>
      {note && <p className="toast">{note}</p>}
      <div className="lb-bar">
        {items.length > 1 && (
          <>
            <button className="ghost" onClick={() => setI((i + items.length - 1) % items.length)}>
              Prev
            </button>
            <button className="ghost" onClick={() => setI((i + 1) % items.length)}>
              Next
            </button>
          </>
        )}
        <button
          onClick={async () => flash((await downloadMedia(m.url)) === 'saved' ? 'Saved' : 'Opened to save')}
        >
          Save
        </button>
        <button
          className="ghost"
          onClick={async () => {
            const r = await shareMedia(m.url)
            flash(r === 'copied' ? 'Link copied' : r === 'failed' ? 'Could not share' : '')
          }}
        >
          Share
        </button>
        {onUseAsInput && !isVideo(m.url, m.mediaType) && !isAudio(m.url, m.mediaType) && (
          <button className="ghost" onClick={() => onUseAsInput(m.url)}>
            Use as input
          </button>
        )}
        {onDelete && (
          <button
            className="ghost"
            onClick={() => {
              onDelete()
              onClose()
            }}
          >
            Remove
          </button>
        )}
        <button className="ghost" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}
