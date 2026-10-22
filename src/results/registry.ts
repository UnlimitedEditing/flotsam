import { createElement, lazy, type ComponentType, type LazyExoticComponent, type ReactElement } from 'react'
import type { ViewerProps } from './viewers/types'

// The viewer component for each kind of result (the facts about each kind live in ./viewerTable.ts). A viewer
// is registered as a lazy import, so its code (three.js, the puppet renderer, an embedded tool) is downloaded
// only when a result of that kind is opened. A kind with no entry here opens in FileInfo.
//
// To add a viewer: add the kind to viewerTable.ts, write the component (a default export taking ViewerProps), and
// add one line below. See docs/viewers.md.

type Loader = () => Promise<{ default: ComponentType<ViewerProps> }>

const text: Loader = () => import('./viewers/TextViewer')

const LOADERS: Record<string, Loader> = {
  model: () => import('./viewers/ModelViewer'),
  text: text,
  score: () => import('./viewers/ScoreViewer'),
  track: () => import('./viewers/TrackViewer'),
  set: () => import('./viewers/SetViewer'),
  shot: () => import('./viewers/ShotViewer'),
  puppet: () => import('./viewers/PuppetViewer'),
  direction: () => import('./viewers/DirectionViewer'),
}

const FALLBACK: Loader = () => import('./viewers/FileInfo')

const cache = new Map<Loader, LazyExoticComponent<ComponentType<ViewerProps>>>()

/** The (lazy) viewer for a kind of result. The same component is returned for the same loader every time. */
export function viewerFor(kind: string): LazyExoticComponent<ComponentType<ViewerProps>> {
  const load = Object.prototype.hasOwnProperty.call(LOADERS, kind) ? LOADERS[kind] : FALLBACK
  let comp = cache.get(load)
  if (!comp) {
    comp = lazy(load)
    cache.set(load, comp)
  }
  return comp
}

/** Whether a kind has a dedicated viewer (the rest fall back to the file-info page). */
export const hasViewer = (kind: string) => Object.prototype.hasOwnProperty.call(LOADERS, kind)

/** The element for a result of this kind. Built here, not in a component, so no component is created while rendering. */
export function renderViewer(kind: string, props: ViewerProps): ReactElement {
  return createElement(viewerFor(kind), props)
}
