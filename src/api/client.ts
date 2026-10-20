import { getApiKey } from './storage'
import type { RenderInfo, Workflow } from './types'

// Override with VITE_API_BASE (e.g. a dev proxy) if the browser CORS check fails.
export const DEFAULT_BASE = 'https://app.graydient.ai/api/v3/'
const BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? DEFAULT_BASE

function headers(): Record<string, string> {
  return {
    'Content-Type': 'application/vnd.api+json',
    Accept: 'application/vnd.api+json',
    Authorization: `Bearer ${getApiKey()}`,
  }
}

export class ApiError extends Error {
  status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.status = status
  }
}

async function get<T>(path: string): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, { headers: headers(), cache: 'no-store' })
  } catch (e) {
    // A network-level TypeError from a browser is most often a CORS block.
    throw new ApiError(`Network/CORS error calling ${path}: ${(e as Error).message}`)
  }
  if (!res.ok) throw new ApiError(`${path} failed: ${res.status}`, res.status)
  return (await res.json()) as T
}

interface JsonApiItem {
  id: string
  attributes?: Omit<Workflow, 'id'>
}

export async function fetchWorkflows(): Promise<Workflow[]> {
  const json = await get<{ data?: JsonApiItem[] } | JsonApiItem[]>('workflows/')
  const items = Array.isArray(json) ? json : (json.data ?? [])
  return items.map((i) => ({ id: i.id, ...(i.attributes ?? (i as unknown as Omit<Workflow, 'id'>)) }))
}

export async function fetchRenderInfo(hash: string): Promise<RenderInfo> {
  const json = await get<{ data?: { attributes?: RenderInfo } } & RenderInfo>(`render/${hash}/`)
  return json.data?.attributes ?? json
}
