import type { ResolvedMedia, SourceMedia } from '../api/types'

export type JobStatus = 'queued' | 'submitting' | 'running' | 'done' | 'failed' | 'canceled'

/** Metadata + URLs only. Media bytes are never stored (NSFW no-cache rule). */
export interface Job {
  id: string
  createdAt: number
  finishedAt?: number
  workflowSlug: string
  workflowName: string
  prompt: string // user-visible text
  command: string // full slash-command string actually sent
  imageUrl?: string // preview of the main input image
  nsfw?: boolean // the workflow is flagged adult: its media is always blurred until tapped
  source?: SourceMedia // everything sent alongside the command (init media, placeholders)
  status: JobStatus
  renderHash?: string
  estimatedRenderTime?: number | null
  estimatedWaitTime?: number | null
  media: ResolvedMedia[]
  error?: string
}

export type NewJob = Pick<
  Job,
  'workflowSlug' | 'workflowName' | 'prompt' | 'command' | 'imageUrl' | 'source' | 'nsfw'
>

export const ACTIVE: JobStatus[] = ['submitting', 'running']
export const isFinished = (s: JobStatus) => s === 'done' || s === 'failed' || s === 'canceled'
