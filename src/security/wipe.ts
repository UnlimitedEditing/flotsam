import { clearAllStored } from '../jobs/store'
import { resetConsentMemory } from '../state/consent'

export interface WipeIO {
  clearLocal: () => void
  clearSession: () => void
  clearStored: () => Promise<void>
  resetMemory: () => void
}

const browserIO: WipeIO = {
  clearLocal: () => localStorage.clear(),
  clearSession: () => sessionStorage.clear(),
  clearStored: clearAllStored,
  resetMemory: resetConsentMemory,
}

/**
 * Removes everything Flotsam keeps on this device: the API key, history, preferences, workflow and score
 * caches, the age/terms consent and the PIN. Cache Storage is left alone on purpose: it holds only the
 * app shell (guarded by the service-worker test), so the app can still open offline.
 */
export async function clearAllData(io: WipeIO = browserIO): Promise<void> {
  for (const step of [io.clearLocal, io.clearSession]) {
    try {
      step()
    } catch {
      /* storage may be blocked; carry on with the rest */
    }
  }
  await io.clearStored()
  io.resetMemory()
}

/** Wipe, then reload so the app starts again at the age gate with nothing remembered. */
export async function clearAllDataAndReload(): Promise<void> {
  await clearAllData()
  location.reload()
}
