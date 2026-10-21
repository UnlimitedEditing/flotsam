import { useState } from 'react'
import Sheet from '../components/ui/Sheet'
import { formatBytes } from './save'
import { clearLibrary, useLibrary } from './store'

/** The library's footprint on this device, and a way to empty it. Shown under Settings > Data on this device. */
export default function LibrarySettings() {
  const items = useLibrary()
  const [confirm, setConfirm] = useState(false)
  const bytes = items.reduce((n, i) => n + i.size, 0)
  return (
    <>
      <p className="muted">
        Library: {items.length} {items.length === 1 ? 'item' : 'items'}, {formatBytes(bytes)}. Only things you
        add are kept here.
      </p>
      <button className="ghost" disabled={items.length === 0} onClick={() => setConfirm(true)}>
        Delete everything in the library
      </button>
      <Sheet open={confirm} onClose={() => setConfirm(false)} title="Empty the library?">
        <p className="muted">
          All {items.length} saved {items.length === 1 ? 'item' : 'items'} will be removed from this device.
          Your renders on Graydient are not affected.
        </p>
        <div className="row">
          <button
            onClick={async () => {
              await clearLibrary()
              setConfirm(false)
            }}
          >
            Delete everything
          </button>
          <button className="ghost" onClick={() => setConfirm(false)}>
            Cancel
          </button>
        </div>
      </Sheet>
    </>
  )
}
