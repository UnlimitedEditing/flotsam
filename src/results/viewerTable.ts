// The facts about each kind of result file, as plain data (no React, no viewer code), so the identification
// rules in `../m3ds/registry.ts` and the viewer components in `./registry.tsx` both derive from ONE table.
//
// Adding a kind of result = one entry here + one viewer component registered in `./registry.tsx`
// (see docs/viewers.md). Namespaced JSON is the convention for new kinds: the file starts with
// `{"format": "<namespace>.<name>", ...}` and lists that format here, so it opens in the right viewer wherever
// it arrives from (a workflow result, the library, a future project file).

export interface ViewerInfo {
  /** Stable id of the kind. Also the library item kind where one exists, otherwise the library shows "File". */
  kind: string
  /** Heading of the result panel once the file is known. */
  title: string
  /** Button wording for a file of this kind. Never says "M3DS": that is how it travels, not what it is. */
  open: string
  /** JSON `format` values that mean this kind (read from the first bytes of the file). */
  formats?: string[]
  /** File-name patterns that mean this kind. */
  extensions?: RegExp[]
  /** Binary signature check, for formats with no useful name or `format` field (glTF binary starts "glTF"). */
  magic?: (data: Uint8Array) => boolean
}

export const VIEWER_INFO: ViewerInfo[] = [
  {
    kind: 'model',
    title: '3D model',
    open: 'View 3D model',
    extensions: [/\.(glb|gltf|ply|stl|obj)$/i],
    magic: (d) =>
      d.length >= 4 &&
      (String.fromCharCode(d[0], d[1], d[2], d[3]) === 'glTF' || // glTF binary
        (String.fromCharCode(d[0], d[1], d[2]) === 'ply' && (d[3] === 10 || d[3] === 13))), // PLY header
  },
  {
    kind: 'text',
    title: 'Text file',
    open: 'Open text',
    extensions: [/\.(txt|md|json|csv|log|srt|vtt|xml|yaml|yml)$/i],
  },
  { kind: 'score', title: 'Song score', open: 'Open score' }, // identified by the declared type, see identifyPayload
  { kind: 'puppet', title: 'Puppet', open: 'Open puppet', formats: ['rigstudio.puppet'] },
  {
    kind: 'direction',
    title: 'Direction sheet',
    open: 'Open direction sheet',
    formats: ['rigstudio.direction'],
  },
  {
    kind: 'track',
    title: 'Performance track',
    open: 'Open performance track',
    formats: ['rigstudio.expression_track'],
  },
  { kind: 'set', title: 'Set', open: 'View set', formats: ['rigstudio.set'] },
  { kind: 'shot', title: 'Shot', open: 'View shot', formats: ['rigstudio.shot'] },
  { kind: 'unknown', title: 'Result', open: 'Open result' },
]

export const KINDS = VIEWER_INFO.map((v) => v.kind)

const byKind = new Map(VIEWER_INFO.map((v) => [v.kind, v]))

/** Title and button wording for a kind; a kind nobody registered reads as an unknown result. */
export function infoFor(kind: string): ViewerInfo {
  return byKind.get(kind) ?? (byKind.get('unknown') as ViewerInfo)
}
