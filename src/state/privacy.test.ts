import { describe, expect, it } from 'vitest'
import type { Job } from '../jobs/types'
import { decide } from '../pwa/notify'
import { appName } from './discreet'
import { DEFAULT_PREFS } from './prefs'

describe('fresh-install privacy defaults', () => {
  it('blurs media, hides adult workflows, covers the screen, and keeps everything else off', () => {
    expect(DEFAULT_PREFS.blurNsfw).toBe(true)
    expect(DEFAULT_PREFS.showAdult).toBe(false)
    expect(DEFAULT_PREFS.privacyScreen).toBe(true)
    expect(DEFAULT_PREFS.discreet).toBe(false)
    expect(DEFAULT_PREFS.notifyDone).toBe(false)
    expect(DEFAULT_PREFS.imageHost).toBe('none')
    expect(DEFAULT_PREFS.catboxUserhash).toBe('')
    expect(DEFAULT_PREFS.lockTimeoutMin).toBe(1)
  })
})

describe('discreet mode', () => {
  const job = (status: Job['status']): Job => ({
    id: 'j',
    createdAt: 1,
    workflowSlug: 's',
    workflowName: 'N',
    prompt: 'p',
    command: 'c',
    status,
    media: [],
  })
  const base = {
    prev: 'running' as const,
    next: job('done'),
    visibility: 'hidden' as const,
    enabled: true,
    permission: 'granted' as const,
  }

  it('uses neutral names', () => {
    expect(appName(true)).toBe('Notes')
    expect(appName(false)).toBe('Flotsam')
  })

  it('makes notifications neutral and free of the app name', () => {
    const n = decide({ ...base, discreet: true })!
    expect(n.title).toBe('Reminder')
    expect(n.body).toBe('Ready')
    expect(JSON.stringify(n).toLowerCase()).not.toContain('flotsam')
    expect(JSON.stringify(n).toLowerCase()).not.toContain('render')
    expect(decide({ ...base, next: job('failed'), discreet: true })!.body).toBe('Needs attention')
  })

  it('keeps the normal wording when off', () => {
    expect(decide(base)!.title).toBe('Flotsam')
  })
})
