import { useJobs } from '../jobs/instance'
import { isFinished } from '../jobs/types'
import { useOnline } from '../pwa/online'
import { applyUpdate, useUpdateReady } from '../pwa/register'

/** A new app version is ready. Reloading would cut off a running render, so it waits until none is active. */
export function UpdateBanner() {
  const ready = useUpdateReady()
  const busy = useJobs().some((j) => !isFinished(j.status))
  if (!ready) return null
  return (
    <div className="banner" role="status">
      <span>
        {busy ? 'An update is ready. It can be applied when your render finishes.' : 'An update is ready.'}
      </span>
      <button className="small" disabled={busy} onClick={applyUpdate}>
        Reload
      </button>
    </div>
  )
}

export function OfflineBanner() {
  const online = useOnline()
  if (online) return null
  return (
    <div className="banner offline" role="status">
      <span>You&apos;re offline. Flotsam needs a connection to render. Your history is still here.</span>
    </div>
  )
}
