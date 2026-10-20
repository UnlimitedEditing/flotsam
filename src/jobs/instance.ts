import { useSyncExternalStore } from 'react'
import {
  cancelRender,
  pollRenderMedia,
  resolveAllMedia,
  submitRender,
  waitForRenderEvent,
} from '../api/client'
import { JobEngine } from './engine'
import { idbStore } from './store'
import type { Job } from './types'

export const engine = new JobEngine(
  { submitRender, waitForRenderEvent, pollRenderMedia, cancelRender, resolveAllMedia },
  idbStore,
)

export function useJobs(): Job[] {
  return useSyncExternalStore(
    (cb) => engine.subscribe(cb),
    () => engine.getJobs(),
  )
}
