import { useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import type { ResolvedMedia } from '../api/types'
import { prefersReducedMotion } from '../lib/motion'
import { saveImageToLibrary } from '../library/save'
import { downloadMedia, isAudio, isVideo, shareMedia } from '../lib/save'

interface Props {
  items: ResolvedMedia[]
  index: number
  onClose: () => void
  onUseAsInput?: (url: string) => void
  onDelete?: () => void
  /** When set, images get a "Save to library" button (the user's explicit choice to keep a copy). */
  libraryNsfw?: boolean
  libraryJobId?: string
}

const DISMISS_DISTANCE = 110
const THUMB_SELECTOR = (url: string) => `[data-media="${CSS.escape(url)}"]`

/** Grow the image out of the thumbnail it was opened from (transform only, one uniform scale). */
function zoomFromThumb(url: string, img: HTMLElement) {
  if (prefersReducedMotion() || typeof img.animate !== 'function') return
  const thumb = document.querySelector<HTMLElement>(THUMB_SELECTOR(url))
  if (!thumb) return
  const a = thumb.getBoundingClientRect()
  const b = img.getBoundingClientRect()
  if (!b.width || !b.height) return
  const scale = Math.max(a.width / b.width, a.height / b.height)
  const dx = a.left + a.width / 2 - (b.left + b.width / 2)
  const dy = a.top + a.height / 2 - (b.top + b.height / 2)
  img.animate(
    [{ transform: `translate(${dx}px, ${dy}px) scale(${scale})` }, { transform: 'translate(0, 0) scale(1)' }],
    { duration: 320, easing: 'cubic-bezier(0.2, 0, 0, 1)' },
  )
}

export default function Lightbox({
  items,
  index,
  onClose,
  onUseAsInput,
  onDelete,
  libraryNsfw,
  libraryJobId,
}: Props) {
  const [i, setI] = useState(index)
  const [note, setNote] = useState('')
  const [drag, setDrag] = useState({ y: 0, on: false })
  const startY = useRef(0)
  const lastY = useRef(0)
  const active = useRef(false)
  const moved = useRef(false)
  const zoomed = useRef(false)
  const m = items[i]
  if (!m) return null

  const flash = (s: string) => {
    setNote(s)
    setTimeout(() => setNote(''), 2500)
  }

  // Drag the picture down (or up) to dismiss: it follows the finger, the backdrop fades, and it springs back
  // if let go early.
  const down = (e: PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('video, audio')) return
    startY.current = e.clientY
    lastY.current = 0
    active.current = true
    moved.current = false
    setDrag({ y: 0, on: true })
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (!active.current) return
    const y = e.clientY - startY.current
    lastY.current = y
    if (Math.abs(y) > 6) moved.current = true
    setDrag({ y, on: true })
  }
  const up = () => {
    if (!active.current) return
    active.current = false
    if (Math.abs(lastY.current) > DISMISS_DISTANCE) onClose()
    else setDrag({ y: 0, on: false })
  }

  const progress = Math.min(Math.abs(drag.y) / 320, 1)
  const style = {
    '--lb-o': 1 - progress,
    '--lb-y': `${drag.y}px`,
    '--lb-s': 1 - progress * 0.15,
  } as CSSProperties

  return (
    <div className="lightbox" role="dialog" aria-modal="true" style={style}>
      <div
        className={`lb-body${drag.on ? ' dragging' : ''}`}
        onPointerDown={down}
        onPointerMove={move}
        onPointerUp={up}
        onPointerCancel={up}
        onClick={() => {
          if (moved.current) moved.current = false
          else onClose()
        }}
      >
        <div className="lb-media">
          {isVideo(m.url, m.mediaType) ? (
            <video src={m.url} controls autoPlay loop playsInline onClick={(e) => e.stopPropagation()} />
          ) : isAudio(m.url, m.mediaType) ? (
            <audio src={m.url} controls onClick={(e) => e.stopPropagation()} />
          ) : (
            <img
              key={m.url}
              src={m.url}
              alt=""
              draggable={false}
              referrerPolicy="no-referrer"
              onClick={(e) => e.stopPropagation()}
              onLoad={(e) => {
                if (zoomed.current) return
                zoomed.current = true
                zoomFromThumb(m.url, e.currentTarget)
              }}
            />
          )}
        </div>
      </div>
      {note && (
        <p className="toast glass" role="status">
          {note}
        </p>
      )}
      <div className="lb-bar glass">
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
        {libraryNsfw !== undefined && !isVideo(m.url, m.mediaType) && !isAudio(m.url, m.mediaType) && (
          <button
            className="ghost"
            onClick={async () => {
              try {
                await saveImageToLibrary(m.url, { nsfw: libraryNsfw, sourceJobId: libraryJobId })
                flash('Saved to library')
              } catch (e) {
                flash((e as Error).message)
              }
            }}
          >
            Save to library
          </button>
        )}
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
