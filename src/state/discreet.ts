import { useEffect } from 'react'
import { usePrefs } from './prefs'

// Discreet mode: what the page itself controls. The installed icon and name cannot be changed from a web
// page; that swap is part of the Android app (Phase 4).
export const REAL_NAME = 'Flotsam'
export const DISCREET_NAME = 'Notes'

export const appName = (discreet: boolean): string => (discreet ? DISCREET_NAME : REAL_NAME)

export function useAppName(): string {
  return appName(usePrefs().discreet)
}

/** Keeps the document (tab/app-switcher) title in step with the setting. Mount once near the root. */
export function useApplyDiscreet(): void {
  const { discreet } = usePrefs()
  useEffect(() => {
    document.title = appName(discreet)
  }, [discreet])
}
