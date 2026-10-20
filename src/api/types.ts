// Shapes ported from ForgeExpress/cli/src/client.ts. Fields marked TODO are unconfirmed.
export interface WorkflowFieldMapping {
  local_field: string
  default_value: string | number | null
  help_text: string
  minimum_value: number | null
  maximum_value: number | null
  node_id?: string | null
}

export interface Workflow {
  id: string
  slug: string
  name: string
  description: string
  thumbnail_url?: string | null
  image_url?: string | null
  avg_elapsed?: number | null
  is_public?: boolean
  is_nsfw?: boolean
  field_mapping: WorkflowFieldMapping[]
  supports_txt2img: boolean
  supports_img2img: boolean
  supports_txt2vid: boolean
  supports_img2vid: boolean
  supports_vid2vid: boolean
  supports_txt2wav: boolean
  // Also present on the API (see docs/api-notes.md): supports_vid2img, supports_img2mesh, supports_txt2mesh,
  // supports_mesh2img, supports_mesh2vid, supports_vid2wav, supports_wav2txt.
}

export interface RenderMedia {
  url: string
  media_type?: string | null
}

export interface RenderImage {
  url?: string
  media?: RenderMedia[]
}

export interface RenderInfo {
  render_hash: string
  has_been_rendered?: boolean
  images?: RenderImage[]
  // TODO: confirm status/progress fields on GET render/<hash>/
}

export interface ResolvedMedia {
  url: string
  mediaType: string | null
  thumbnailUrl: string | null
}

/** Source media sent with a render. Graydient only accepts URLs (see images/resolve.ts). */
export interface SourceMedia {
  initImage?: string
  initImageUrl?: string
  initVideo?: string
  initVideoUrl?: string
  initAudio?: string
  initAudioUrl?: string
  initMeshUrl?: string
  /** `/imageN:URLn` references in the command resolve through this map (key must look like URL<n>). */
  placeholders?: Record<string, string>
}
