import { describe, expect, it } from 'vitest'
import { buildRequest, emptyForm, missingRequired, sizeToken, unsupportedSlots } from './command'
import { classify, hasResolution, outputKinds, validateNumber } from './schema'
import { img2img, meshFlow, mossTurbo, multiRef, sizeText, video } from './fixtures'

describe('classify', () => {
  it('gives moss-turbo a size control and its real options, with no media', () => {
    const s = classify(mossTurbo)
    expect(s.size).toEqual({ mode: 'wh', min: 512, max: 1536, defaultW: 1024, defaultH: 1024 })
    expect(s.negativeField).toBe('prompt_negative')
    expect(s.media).toEqual([])
    expect(s.options.map((o) => o.field)).toEqual([
      'seed',
      'steps',
      'sampler',
      'scheduler',
      'slot1',
      'slot2',
      'guidance',
    ])
    expect(s.options.find((o) => o.field === 'sampler')).toMatchObject({ numeric: false, def: 'er_sde' })
    expect(s.options.find((o) => o.field === 'steps')).toMatchObject({ numeric: true, min: 4, max: 25 })
  })

  it('treats an img2img workflow as needing an input image', () => {
    const s = classify(img2img)
    expect(s.media).toEqual([expect.objectContaining({ id: 'init_image', via: 'init', required: true })])
    expect(s.options.map((o) => o.field)).toEqual(['strength'])
  })

  it('creates one slot per referenced image and leaves them optional when text input also works', () => {
    const s = classify(multiRef)
    expect(s.media.map((m) => [m.id, m.via, m.required])).toEqual([
      ['image1', 'placeholder', false],
      ['image2', 'placeholder', false],
    ])
    expect(s.options.find((o) => o.field === 'num_images')).toMatchObject({ key: 'images', label: 'Images' })
  })

  it('collapses init_image_* variants into one slot and handles video outputs', () => {
    const s = classify(video)
    expect(s.media.map((m) => m.id)).toEqual(['init_image'])
    expect(s.outputs).toEqual(['video'])
    expect(s.size).toBeDefined()
  })

  it('hides resolution for mesh-only workflows even if they map width/height', () => {
    const s = classify(meshFlow)
    expect(outputKinds(meshFlow)).toEqual(['mesh'])
    expect(hasResolution(s.outputs)).toBe(false)
    expect(s.size).toBeUndefined()
    expect(s.options.find((o) => o.field === 'slot9')?.note).toMatch(/may not/)
  })

  it('supports a single `size` field', () => {
    expect(classify(sizeText).size).toMatchObject({ mode: 'size' })
  })
})

describe('buildRequest', () => {
  const sc = classify(mossTurbo)
  it('omits blanks and the default size', () => {
    const r = buildRequest(mossTurbo, sc, {
      ...emptyForm(),
      prompt: ' a cat ',
      negative: 'blurry',
      options: { seed: '7', steps: '' },
    })
    expect(r.command).toBe('/workflow /run:moss-turbo /seed:7 a cat [blurry]')
  })

  it('sends /size:WxH when changed, filling the other side from the default', () => {
    expect(sizeToken(sc, { ...emptyForm(), width: '1280' })).toBe('/size:1280x1024')
    expect(sizeToken(sc, { ...emptyForm(), width: '1024', height: '1024' })).toBeNull()
    expect(sizeToken(sc, emptyForm())).toBeNull()
    const r = buildRequest(mossTurbo, sc, { ...emptyForm(), width: '768', height: '1152', prompt: 'x' })
    expect(r.command).toBe('/workflow /run:moss-turbo /size:768x1152 x')
  })

  it('sends a single size string', () => {
    expect(
      buildRequest(sizeText, classify(sizeText), { ...emptyForm(), sizeText: '640x640', prompt: 'p' })
        .command,
    ).toBe('/workflow /run:size-text /size:640x640 p')
  })

  it('routes imageN through URL<n> placeholders and init media through source fields', () => {
    const m = buildRequest(multiRef, classify(multiRef), {
      ...emptyForm(),
      prompt: 'two refs',
      media: { image1: 'https://x/a.png', image2: 'https://x/b.png' },
    })
    expect(m.command).toBe('/workflow /run:multiref /image1:URL1 /image2:URL2 two refs')
    expect(m.source.placeholders).toEqual({ URL1: 'https://x/a.png', URL2: 'https://x/b.png' })

    const i = buildRequest(img2img, classify(img2img), {
      ...emptyForm(),
      prompt: 'edit',
      media: { init_image: 'https://x/c.png' },
    })
    expect(i.source).toMatchObject({ initImage: 'https://x/c.png', initImageUrl: 'https://x/c.png' })
    expect(i.source.placeholders).toBeUndefined()
  })

  it('renames num_images to /images:', () => {
    expect(
      buildRequest(multiRef, classify(multiRef), { ...emptyForm(), options: { num_images: '3' } }).command,
    ).toContain('/images:3')
  })
})

describe('required and unsupported inputs', () => {
  it('reports a missing required image and clears it once supplied', () => {
    const sc = classify(img2img)
    expect(missingRequired(sc, emptyForm()).map((s) => s.id)).toEqual(['init_image'])
    expect(missingRequired(sc, { ...emptyForm(), media: { init_image: 'https://x/a.png' } })).toEqual([])
    expect(unsupportedSlots(sc)).toEqual([])
  })
})

describe('validateNumber', () => {
  it('checks number and range, allows blank', () => {
    expect(validateNumber('', 1, 5)).toBeNull()
    expect(validateNumber('3', 1, 5)).toBeNull()
    expect(validateNumber('x', 1, 5)).toBe('Must be a number')
    expect(validateNumber('0', 1, 5)).toBe('Min 1')
    expect(validateNumber('9', 1, 5)).toBe('Max 5')
  })
})
