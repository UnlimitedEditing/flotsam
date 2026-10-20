import { describe, expect, it } from 'vitest'
import type { Job } from '../jobs/types'
import { installState } from './install'
import { decide, type DecisionInput } from './notify'

const job = (status: Job['status']): Job => ({
  id: 'j1',
  createdAt: 1,
  workflowSlug: 'secret-workflow',
  workflowName: 'Secret Workflow Name',
  prompt: 'a very private prompt',
  command: '/workflow /run:secret-workflow a very private prompt',
  status,
  media: [{ url: 'https://example.com/private-image.png', mediaType: null, thumbnailUrl: null }],
})

const base = (over: Partial<DecisionInput>): DecisionInput => ({
  prev: 'running',
  next: job('done'),
  visibility: 'hidden',
  enabled: true,
  permission: 'granted',
  ...over,
})

describe('notification decision', () => {
  it('notifies once when a live job finishes while the app is in the background', () => {
    expect(decide(base({}))).toMatchObject({ body: 'Your render is ready', tag: 'job-j1', jobId: 'j1' })
    expect(decide(base({ next: job('failed') }))?.body).toBe('A render needs attention')
  })

  it('stays quiet in the foreground, when disabled, without permission, or for cancels', () => {
    expect(decide(base({ visibility: 'visible' }))).toBeNull()
    expect(decide(base({ enabled: false }))).toBeNull()
    expect(decide(base({ permission: 'default' }))).toBeNull()
    expect(decide(base({ permission: 'denied' }))).toBeNull()
    expect(decide(base({ next: job('canceled') }))).toBeNull()
  })

  it('does not re-notify for jobs that were already finished or are still running', () => {
    expect(decide(base({ prev: 'done' }))).toBeNull()
    expect(decide(base({ prev: undefined }))).toBeNull()
    expect(decide(base({ prev: 'queued', next: job('running') }))).toBeNull()
  })

  it('never puts job content in the payload', () => {
    const spec = decide(base({}))!
    const text = JSON.stringify(spec)
    for (const secret of ['private', 'Secret', 'secret-workflow', 'example.com', '.png']) {
      expect(text).not.toContain(secret)
    }
  })
})

describe('install state', () => {
  const i = { standalone: false, ios: false, hasPrompt: false, iosHintDismissed: false }
  it('prefers installed, then the native prompt, then the iOS hint', () => {
    expect(installState({ ...i, standalone: true, hasPrompt: true })).toBe('installed')
    expect(installState({ ...i, hasPrompt: true })).toBe('prompt')
    expect(installState({ ...i, ios: true })).toBe('ios-hint')
    expect(installState({ ...i, ios: true, iosHintDismissed: true })).toBe('none')
    expect(installState(i)).toBe('none')
  })
})
