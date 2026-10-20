import type { Workflow, WorkflowFieldMapping } from '../api/types'

// Workflow shapes taken from the live API probe (2026-10-20). Field mappings for moss/moss-turbo are
// verbatim; the others are minimal shapes using field names counted in the probe.
const f = (
  local_field: string,
  def: string | number | null = null,
  min: number | null = null,
  max: number | null = null,
  help_text = '',
): WorkflowFieldMapping => ({
  local_field,
  default_value: def,
  minimum_value: min,
  maximum_value: max,
  help_text,
})

const base = (over: Partial<Workflow>): Workflow =>
  ({
    id: '1',
    slug: 'x',
    name: 'X',
    description: '',
    field_mapping: [],
    supports_txt2img: false,
    supports_img2img: false,
    supports_txt2vid: false,
    supports_img2vid: false,
    supports_vid2vid: false,
    supports_txt2wav: false,
    ...over,
  }) as Workflow

export const mossTurbo = base({
  slug: 'moss-turbo',
  name: 'moss-turbo',
  supports_txt2img: true,
  field_mapping: [
    f('prompt_positive'),
    f('prompt_negative'),
    f('seed', 42),
    f('steps', 8, 4, 25),
    f('sampler', 'er_sde'),
    f('scheduler', 'simple'),
    f('width', 1024, 512, 1536),
    f('height', 1024, 512, 1536),
    f('slot1', 22),
    f('slot2', 1.0, 0.0, 2.0),
    f('guidance', 1, 0.1, 6),
  ],
})

export const img2img = base({
  slug: 'edit-one',
  name: 'Edit One',
  supports_img2img: true,
  field_mapping: [
    f('prompt_positive'),
    f('init_image_url'),
    f('strength', 0.6, 0, 1),
    f('width', 768, 512, 1280),
    f('height', 768, 512, 1280),
  ],
})

export const multiRef = base({
  slug: 'multiref',
  name: 'Multi Ref',
  supports_img2img: true,
  supports_txt2img: true,
  field_mapping: [
    f('prompt'),
    f('image1'),
    f('image2'),
    f('width', 640, 256, 1024),
    f('height', 640, 256, 1024),
    f('num_images', 1, 1, 4),
  ],
})

export const video = base({
  slug: 'animate',
  name: 'Animate',
  supports_img2vid: true,
  field_mapping: [
    f('prompt_positive'),
    f('init_image_filename'),
    f('length', 81, 9, 121),
    f('fps', 16),
    f('width', 704, 256, 1280),
    f('height', 704, 256, 1280),
  ],
})

export const meshFlow = base({
  slug: 'to-mesh',
  name: 'To Mesh',
  field_mapping: [
    f('init_image_url'),
    f('seed', 1),
    f('slot1', 0),
    f('slot9', 0),
    f('width', 512),
    f('height', 512),
  ],
  ...({ supports_img2mesh: true } as object),
})

export const sizeText = base({
  slug: 'size-text',
  name: 'Size Text',
  supports_txt2img: true,
  field_mapping: [f('prompt_positive'), f('size')],
})

export const adultOne = base({ slug: 'adult', name: 'Adult', supports_txt2img: true, is_nsfw: true })
