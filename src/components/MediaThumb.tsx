import { useState } from 'react'
import type { ResolvedMedia } from '../api/types'
import { isAudio, isVideo } from '../lib/save'
import { usePrefs } from '../state/prefs'

// Per-session reveal memory only (never persisted): a reload blurs everything again.
const revealed = new Set<string>()

interface Props {
  media: ResolvedMedia
  onOpen?: () => void
  controls?: boolean
}

export default function MediaThumb({ media, onOpen, controls }: Props) {
  const { blurNsfw } = usePrefs()
  const [, bump] = useState(0)
  const hidden = blurNsfw && !revealed.has(media.url)
  const video = isVideo(media.url, media.mediaType)

  if (isAudio(media.url, media.mediaType)) {
    return <audio className="media" src={media.url} controls preload="none" />
  }

  const click = () => {
    if (hidden) {
      revealed.add(media.url)
      bump((n) => n + 1)
    } else onOpen?.()
  }

  return (
    <button
      type="button"
      className={`thumb${hidden ? ' blurred' : ''}`}
      onClick={click}
      aria-label={hidden ? 'Reveal' : 'Open'}
    >
      {video ? (
        <video
          className="media"
          src={hidden ? undefined : media.url}
          poster={media.thumbnailUrl ?? undefined}
          controls={controls && !hidden}
          muted
          playsInline
          preload="none"
        />
      ) : (
        <img className="media" src={media.url} loading="lazy" alt="" referrerPolicy="no-referrer" />
      )}
      {hidden && <span className="reveal">Tap to reveal</span>}
    </button>
  )
}
