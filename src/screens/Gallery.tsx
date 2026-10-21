import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import Lightbox from '../components/Lightbox'
import MediaThumb from '../components/MediaThumb'
import EmptyState from '../components/ui/EmptyState'
import { engine, useJobs } from '../jobs/instance'
import { useLibrary } from '../library/store'
import Library from './Library'

// The gallery is this device's history of completed renders (URLs only). Removing an item removes it
// from this device; Graydient's copy is unaffected (no known delete endpoint). The Library tab holds what the
// user chose to keep (see src/library/store.ts).
export default function Gallery() {
  const jobs = useJobs()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'library' ? 'library' : 'results'
  const saved = useLibrary().length
  const items = useMemo(
    () =>
      jobs
        .filter((j) => j.status === 'done')
        .sort((a, b) => (b.finishedAt ?? 0) - (a.finishedAt ?? 0))
        .flatMap((j) => j.media.map((m, i) => ({ jobId: j.id, i, m, nsfw: !!j.nsfw }))),
    [jobs],
  )
  const [open, setOpen] = useState<number | null>(null)
  const cur = open != null ? items[open] : null

  const choose = (t: 'results' | 'library') =>
    setParams(t === 'library' ? { tab: 'library' } : {}, { replace: true })

  return (
    <main className="page">
      <h1>Gallery</h1>
      <div className="seg" role="tablist" aria-label="Gallery sections">
        <button
          role="tab"
          aria-selected={tab === 'results'}
          className={tab === 'results' ? 'on' : ''}
          onClick={() => choose('results')}
        >
          Results
        </button>
        <button
          role="tab"
          aria-selected={tab === 'library'}
          className={tab === 'library' ? 'on' : ''}
          onClick={() => choose('library')}
        >
          Library{saved ? ` (${saved})` : ''}
        </button>
      </div>

      {tab === 'library' ? (
        <Library />
      ) : (
        <>
          {items.length === 0 && (
            <EmptyState icon="gallery" title="No renders yet">
              <p className="muted">Finished renders appear here.</p>
            </EmptyState>
          )}
          <div className="grid">
            {items.map((it, idx) => (
              <MediaThumb key={it.m.url} media={it.m} forceBlur={it.nsfw} onOpen={() => setOpen(idx)} />
            ))}
          </div>
          {cur && (
            <Lightbox
              items={items.map((x) => x.m)}
              index={open!}
              onClose={() => setOpen(null)}
              onUseAsInput={(url) => navigate('/', { state: { imageUrl: url } })}
              onDelete={() => engine.remove(cur.jobId)}
              libraryNsfw={cur.nsfw}
              libraryJobId={cur.jobId}
            />
          )}
        </>
      )}
    </main>
  )
}
