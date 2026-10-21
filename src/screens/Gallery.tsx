import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Lightbox from '../components/Lightbox'
import MediaThumb from '../components/MediaThumb'
import EmptyState from '../components/ui/EmptyState'
import { engine, useJobs } from '../jobs/instance'

// The gallery is this device's history of completed renders (URLs only). Removing an item removes it
// from this device; Graydient's copy is unaffected (no known delete endpoint).
export default function Gallery() {
  const jobs = useJobs()
  const navigate = useNavigate()
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

  return (
    <main className="page">
      <h1>Gallery</h1>
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
        />
      )}
    </main>
  )
}
