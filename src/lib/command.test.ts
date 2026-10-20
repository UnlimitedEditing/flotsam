import { describe, expect, it } from 'vitest'
import type { Workflow } from '../api/types'
import { buildCommand, formFields, validateOption, wantsImage } from './command'

const wf = (over: Partial<Workflow> = {}): Workflow =>
  ({
    id: '1',
    slug: 's',
    name: 'S',
    description: '',
    field_mapping: [],
    supports_txt2img: true,
    supports_img2img: false,
    supports_txt2vid: false,
    supports_img2vid: false,
    supports_vid2vid: false,
    supports_txt2wav: false,
    ...over,
  }) as Workflow

describe('buildCommand', () => {
  it('assembles run, options, prompt and negative', () => {
    expect(
      buildCommand({
        workflowSlug: 'flux',
        prompt: ' a cat ',
        negative: 'blurry',
        options: { seed: '7', steps: '' },
      }),
    ).toBe('/workflow /run:flux /seed:7 a cat [blurry]')
  })
  it('works with only a slug', () => {
    expect(buildCommand({ workflowSlug: 'x', prompt: '' })).toBe('/workflow /run:x')
  })
})

describe('formFields / wantsImage', () => {
  it('keeps only option fields', () => {
    const w = wf({
      field_mapping: [
        { local_field: 'prompt_positive' },
        { local_field: 'seed' },
        { local_field: 'slot1' },
        { local_field: 'init_image_url' },
      ] as Workflow['field_mapping'],
    })
    expect(formFields(w).map((f) => f.local_field)).toEqual(['seed', 'slot1'])
    expect(wantsImage(w)).toBe(true)
    expect(wantsImage(wf())).toBe(false)
  })
})

describe('validateOption', () => {
  const f = { local_field: 'steps', minimum_value: 1, maximum_value: 50 } as Workflow['field_mapping'][number]
  it('checks number and range, allows blank', () => {
    expect(validateOption(f, '')).toBeNull()
    expect(validateOption(f, '20')).toBeNull()
    expect(validateOption(f, 'x')).toBe('Must be a number')
    expect(validateOption(f, '0')).toBe('Min 1')
    expect(validateOption(f, '99')).toBe('Max 50')
  })
})
