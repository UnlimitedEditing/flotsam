import { lazy, Suspense, useEffect, useState } from 'react'
import Lightbox from '../components/Lightbox'
import EmptyState from '../components/ui/EmptyState'
import Icon from '../components/ui/Icon'
import Sheet from '../components/ui/Sheet'
import {
  getLibraryBytes,
  removeLibraryItem,
  renameLibraryItem,
  useLibrary,
  type LibraryItem,
} from '../library/store'
import { formatBytes, KIND_ICON, KIND_LABEL } from '../library/save'
import { usePrefs } from '../state/prefs'

const ResultPanel = lazy(() => import('../results/ResultPanel'))

// Which thumbnails the user has revealed this session (never persisted, like result thumbnails).
const revealed = new Set<string>()

type Open =
  | { item: LibraryItem; image: string } // an image: shown in the lightbox from a temporary object URL
  | { item: LibraryItem; file: { filename: string; data: Uint8Array } }

/** Everything the user chose to keep on this device. */
export default function Library() {
  const items = useLibrary()
  const { blurNsfw } = usePrefs()
  const [, bump] = useState(0)
  const [open, setOpen] = useState<Open | null>(null)
  const [renaming, setRenaming] = useState<LibraryItem | null>(null)
  const [draft, setDraft] = useState('')
  const [deleting, setDeleting] = useState<LibraryItem | null>(null)
  const [error, setError] = useState('')

  // an image is opened through a temporary object URL, released when it closes
  useEffect(() => {
    if (!open || !('image' in open)) return
    const url = open.image
    return () => URL.revokeObjectURL(url)
  }, [open])

  const openItem = async (item: LibraryItem) => {
    setError('')
    const bytes = await getLibraryBytes(item.id)
    if (!bytes) return setError('That item could not be read from this device.')
    if (item.kind === 'image') {
      const ext = item.filename.split('.').pop()?.toLowerCase()
      const type =
        ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : 'image/png'
      setOpen({ item, image: URL.createObjectURL(new Blob([bytes as BlobPart], { type })) })
    } else setOpen({ item, file: { filename: item.filename, data: bytes } })
  }

  const tap = (item: LibraryItem) => {
    const hidden = (blurNsfw || item.nsfw) && !revealed.has(item.id) && !!item.thumb
    if (hidden) {
      revealed.add(item.id)
      bump((n) => n + 1)
    } else void openItem(item)
  }

  if (items.length === 0)
    return (
      <EmptyState icon="library" title="Nothing saved yet">
        <p className="muted">Use “Add to library” on a result to keep it here.</p>
      </EmptyState>
    )

  const total = items.reduce((n, i) => n + i.size, 0)
  return (
    <div className="library">
      <p className="muted">
        {items.length} {items.length === 1 ? 'item' : 'items'} · {formatBytes(total)} on this device. Only
        things you add appear here.
      </p>
      {error && <p className="error">{error}</p>}
      <ul className="lib-grid">
        {items.map((it) => {
          const hidden = (blurNsfw || it.nsfw) && !revealed.has(it.id) && !!it.thumb
          return (
            <li key={it.id} className="lib-card">
              <button
                type="button"
                className={`lib-open${hidden ? ' blurred' : ''}`}
                onClick={() => tap(it)}
                aria-label={hidden ? `Reveal ${it.name}` : `Open ${it.name}`}
              >
                {it.thumb ? (
                  <img src={it.thumb} alt="" />
                ) : (
                  <span className="lib-icon">
                    <Icon name={KIND_ICON[it.kind]} size={34} />
                  </span>
                )}
                {hidden && <span className="reveal">Tap to reveal</span>}
              </button>
              <div className="lib-meta">
                <strong className="lib-name">{it.name}</strong>
                <span className="muted">
                  {KIND_LABEL[it.kind]} · {formatBytes(it.size)}
                </span>
              </div>
              <div className="row">
                <button
                  className="ghost small"
                  onClick={() => {
                    setDraft(it.name)
                    setRenaming(it)
                  }}
                >
                  Rename
                </button>
                <button className="ghost small" onClick={() => setDeleting(it)}>
                  Delete
                </button>
              </div>
            </li>
          )
        })}
      </ul>

      {open && 'image' in open && (
        <Lightbox
          items={[{ url: open.image, mediaType: 'image/*', thumbnailUrl: null }]}
          index={0}
          onClose={() => setOpen(null)}
        />
      )}
      {open && 'file' in open && (
        <Suspense fallback={null}>
          <ResultPanel
            decoded={{ filename: open.file.filename, data: open.file.data, chunks: 1 }}
            spec={{ carrier: 'm3ds', expect: 'unknown' }}
            title={open.item.name}
            onClose={() => setOpen(null)}
          />
        </Suspense>
      )}

      <Sheet open={!!renaming} onClose={() => setRenaming(null)} title="Rename">
        <input
          value={draft}
          maxLength={80}
          onChange={(e) => setDraft(e.target.value)}
          aria-label="Name"
          autoFocus
        />
        <div className="row">
          <button
            disabled={!draft.trim()}
            onClick={async () => {
              if (renaming) await renameLibraryItem(renaming.id, draft)
              setRenaming(null)
            }}
          >
            Save
          </button>
          <button className="ghost" onClick={() => setRenaming(null)}>
            Cancel
          </button>
        </div>
      </Sheet>
      <Sheet open={!!deleting} onClose={() => setDeleting(null)} title="Delete from library?">
        <p className="muted">
          {deleting?.name} will be removed from this device. Your original render on Graydient is not
          affected.
        </p>
        <div className="row">
          <button
            onClick={async () => {
              if (deleting) await removeLibraryItem(deleting.id)
              setDeleting(null)
            }}
          >
            Delete
          </button>
          <button className="ghost" onClick={() => setDeleting(null)}>
            Cancel
          </button>
        </div>
      </Sheet>
    </div>
  )
}
