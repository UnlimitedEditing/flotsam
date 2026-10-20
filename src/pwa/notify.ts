import type { Job, JobStatus } from '../jobs/types'
import { isFinished } from '../jobs/types'

// "Render ready" notifications. Rules (from the project plan):
//  - the text is generic: never the prompt, workflow name, thumbnail or any generated content
//  - only when the app is not in the foreground (the UI already shows results when it is)
//  - off by default; permission is requested only from a tap in Settings
//
// Limit: without a push service (Graydient offers none) a PWA can only notify while its page is still alive
// (open, or recently backgrounded). Notifications with the app fully closed need Phase 4 (Android) or a
// push backend later.

export type NotifyPermission = 'unsupported' | 'default' | 'granted' | 'denied'

export function permissionState(): NotifyPermission {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission
}

export async function requestNotifyPermission(): Promise<NotifyPermission> {
  if (typeof Notification === 'undefined') return 'unsupported'
  return Notification.requestPermission()
}

export interface NotificationSpec {
  title: string
  body: string
  tag: string
  jobId: string
}

export interface DecisionInput {
  prev: JobStatus | undefined
  next: Job
  visibility: DocumentVisibilityState
  enabled: boolean
  permission: NotifyPermission
  discreet?: boolean // neutral wording, nothing that names the app
}

/** Returns the notification to show, or null. Payload text is fixed and contains no job content. */
export function decide({
  prev,
  next,
  visibility,
  enabled,
  permission,
  discreet,
}: DecisionInput): NotificationSpec | null {
  if (!enabled || permission !== 'granted' || visibility !== 'hidden') return null
  if (!prev || isFinished(prev) || !isFinished(next.status)) return null // only a live job that just finished
  if (next.status === 'canceled') return null
  const ok = next.status === 'done'
  return {
    title: discreet ? 'Reminder' : 'Flotsam',
    body: discreet
      ? ok
        ? 'Ready'
        : 'Needs attention'
      : ok
        ? 'Your render is ready'
        : 'A render needs attention',
    tag: `job-${next.id}`,
    jobId: next.id,
  }
}

async function show(spec: NotificationSpec): Promise<void> {
  const options: NotificationOptions = {
    body: spec.body,
    tag: spec.tag,
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    data: { jobId: spec.jobId },
  }
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    if (reg) return await reg.showNotification(spec.title, options)
  } catch {
    /* fall through */
  }
  try {
    new Notification(spec.title, options)
  } catch {
    /* some mobile browsers only allow the service worker route */
  }
}

interface EngineLike {
  subscribe(fn: (jobs: Job[]) => void): () => void
  getJobs(): Job[]
}

/** Watches job status changes and notifies per `decide`. `getEnabled` is read each time so toggles apply live. */
export function startNotifier(
  engine: EngineLike,
  getEnabled: () => boolean,
  getDiscreet: () => boolean = () => false,
): () => void {
  const last = new Map<string, JobStatus>(engine.getJobs().map((j) => [j.id, j.status]))
  return engine.subscribe((jobs) => {
    for (const job of jobs) {
      const spec = decide({
        prev: last.get(job.id),
        next: job,
        visibility: document.visibilityState,
        enabled: getEnabled(),
        permission: permissionState(),
        discreet: getDiscreet(),
      })
      last.set(job.id, job.status)
      if (spec) void show(spec)
    }
  })
}
