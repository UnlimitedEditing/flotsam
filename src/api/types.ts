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
  field_mapping: WorkflowFieldMapping[]
  supports_txt2img: boolean
  supports_img2img: boolean
  supports_txt2vid: boolean
  supports_img2vid: boolean
  supports_vid2vid: boolean
  supports_txt2wav: boolean
}

export interface RenderMedia {
  url: string
  media_type?: string | null
}

export interface RenderInfo {
  render_hash: string
  images?: Array<{ url?: string; media?: RenderMedia[] }>
  // TODO: confirm status/progress fields on GET render/<hash>/
}
