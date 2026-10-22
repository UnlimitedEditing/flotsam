export type ModelFormat = 'glb' | 'gltf' | 'ply' | 'stl' | 'obj'

const ascii = (d: Uint8Array, n: number) => String.fromCharCode(...d.subarray(0, n))

/** The 3D file format, from the bytes first (glTF binary and PLY have signatures), then the file name. */
export function modelFormat(filename: string, data: Uint8Array): ModelFormat | null {
  if (data.length >= 4 && ascii(data, 4) === 'glTF') return 'glb'
  if (data.length >= 4 && ascii(data, 3) === 'ply' && (data[3] === 10 || data[3] === 13)) return 'ply'
  const ext = /\.([a-z0-9]+)$/i.exec(filename)?.[1].toLowerCase()
  if (ext === 'glb' || ext === 'gltf' || ext === 'ply' || ext === 'stl' || ext === 'obj') return ext
  return null
}

/** Human note about what the viewer can and cannot show for a format. */
export const FORMAT_NOTE: Record<ModelFormat, string> = {
  glb: 'glTF binary',
  gltf: 'glTF (self-contained files only)',
  ply: 'PLY',
  stl: 'STL (shape only: no colours)',
  obj: 'OBJ (shape only: materials are not loaded)',
}
