import { useEffect, useRef, useState } from 'react'
import { FORMAT_NOTE, modelFormat, type ModelFormat } from './modelFormat'
import type { ViewerProps } from './types'

type Three = typeof import('three')
type Object3D = import('three').Object3D
type Mesh = import('three').Mesh
type Material = import('three').Material

const HEAVY_TRIANGLES = 2_000_000

interface Controls {
  reset: () => void
  wireframe: (on: boolean) => void
  spin: (on: boolean) => void
}

const noControls: Controls = { reset: () => {}, wireframe: () => {}, spin: () => {} }

const materialsOf = (o: Object3D): Material[] => {
  const m = (o as Mesh).material
  return Array.isArray(m) ? m : m ? [m] : []
}

/** Reads the file into something drawable. Loaders are imported here, so each format's code loads only when used. */
async function load(
  THREE: Three,
  format: ModelFormat,
  filename: string,
  data: Uint8Array,
): Promise<Object3D> {
  const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
  if (format === 'glb' || format === 'gltf') {
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
    const gltf = await new Promise<{ scene: Object3D }>((resolve, reject) =>
      new GLTFLoader().parse(buffer, '', resolve, reject),
    )
    return gltf.scene
  }
  if (format === 'obj') {
    const { OBJLoader } = await import('three/examples/jsm/loaders/OBJLoader.js')
    const obj = new OBJLoader().parse(new TextDecoder().decode(data))
    obj.traverse((o) => {
      const m = o as Mesh
      if (m.isMesh) m.material = new THREE.MeshStandardMaterial({ color: 0xc9d4d8 })
    })
    return obj
  }
  // PLY and STL give a bare geometry: draw it as a mesh, with its own vertex colours when it has them, or as
  // points when it has no faces (a scan or splat export).
  const geometry =
    format === 'ply'
      ? new (await import('three/examples/jsm/loaders/PLYLoader.js')).PLYLoader().parse(buffer)
      : new (await import('three/examples/jsm/loaders/STLLoader.js')).STLLoader().parse(buffer)
  if (!geometry.attributes.position || geometry.attributes.position.count === 0)
    throw new Error(`${filename} has no geometry.`)
  const coloured = !!geometry.attributes.color
  if (format === 'ply' && !geometry.index) {
    return new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        size: 0.01,
        sizeAttenuation: true,
        vertexColors: coloured,
        color: 0xc9d4d8,
      }),
    )
  }
  if (!geometry.attributes.normal) geometry.computeVertexNormals()
  return new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ color: coloured ? 0xffffff : 0xc9d4d8, vertexColors: coloured }),
  )
}

// three.js is imported dynamically so the 3D code only loads when a model is actually opened.
export default function ModelViewer({ filename, data }: ViewerProps) {
  const host = useRef<HTMLDivElement>(null)
  const ctl = useRef<Controls>(noControls)
  const [error, setError] = useState('')
  const [stats, setStats] = useState('')
  const [wire, setWire] = useState(false)
  const [spin, setSpin] = useState(false)
  const format = modelFormat(filename, data)

  useEffect(() => {
    let disposed = false
    let cleanup = () => {}

    void (async () => {
      const el = host.current
      if (!el) return
      if (!format) {
        setError('This is not a 3D file Flotsam can show (glb, gltf, obj, ply or stl).')
        return
      }
      try {
        const THREE = await import('three')
        const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js')
        if (disposed) return

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        el.appendChild(renderer.domElement)
        renderer.domElement.style.width = '100%'
        renderer.domElement.style.height = '100%'
        renderer.domElement.style.touchAction = 'none'
        renderer.domElement.addEventListener('webglcontextlost', (e) => {
          e.preventDefault()
          setError(
            'The phone ran out of graphics memory and stopped drawing this model. Close it and open it again.',
          )
        })

        const scene = new THREE.Scene()
        scene.add(new THREE.HemisphereLight(0xffffff, 0x444455, 1.6))
        const sun = new THREE.DirectionalLight(0xffffff, 2)
        sun.position.set(3, 5, 4)
        scene.add(sun)

        const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000)
        const controls = new OrbitControls(camera, renderer.domElement)
        controls.enableDamping = true
        controls.autoRotateSpeed = 2

        const size = () => {
          const w = el.clientWidth || 300
          const h = el.clientHeight || 300
          renderer.setSize(w, h, false)
          camera.aspect = w / h
          camera.updateProjectionMatrix()
        }
        size()
        const ro = new ResizeObserver(size)
        ro.observe(el)

        const model = await load(THREE, format, filename, data)
        if (disposed) {
          renderer.dispose()
          return
        }
        // Meshes from converters often have flipped or missing faces: draw both sides so nothing looks hollow.
        model.traverse((o) => {
          for (const mat of materialsOf(o)) mat.side = THREE.DoubleSide
        })
        scene.add(model)

        const box = new THREE.Box3().setFromObject(model)
        const centre = box.getCenter(new THREE.Vector3())
        const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 0.001)
        let tris = 0
        let points = 0
        model.traverse((o) => {
          const m = o as Mesh & { isPoints?: boolean }
          const g = m.geometry
          if (!g) return
          const n = g.index ? g.index.count : (g.attributes.position?.count ?? 0)
          if (m.isPoints) points += n
          else if (m.isMesh) tris += n / 3
        })
        setStats(
          points
            ? `${points.toLocaleString()} points`
            : `${Math.round(tris).toLocaleString()} triangles${tris > HEAVY_TRIANGLES ? ' (heavy: it may be slow)' : ''}`,
        )

        const frame = () => {
          camera.near = radius / 100
          camera.far = radius * 100
          camera.position
            .copy(centre)
            .add(new THREE.Vector3(1, 0.6, 1).normalize().multiplyScalar(radius * 3.2))
          camera.updateProjectionMatrix()
          controls.target.copy(centre)
          controls.update()
        }
        frame()
        ctl.current = {
          reset: frame,
          wireframe: (on) =>
            model.traverse((o) => {
              for (const mat of materialsOf(o)) (mat as Material & { wireframe?: boolean }).wireframe = on
            }),
          spin: (on) => {
            controls.autoRotate = on
          },
        }

        let raf = 0
        const loop = () => {
          controls.update()
          renderer.render(scene, camera)
          raf = requestAnimationFrame(loop)
        }
        loop()

        cleanup = () => {
          ctl.current = noControls
          cancelAnimationFrame(raf)
          ro.disconnect()
          controls.dispose()
          scene.traverse((o) => {
            const m = o as Mesh
            m.geometry?.dispose?.()
            for (const mat of materialsOf(o)) {
              for (const v of Object.values(mat)) {
                const tex = v as { isTexture?: boolean; dispose?: () => void } | null
                if (tex?.isTexture) tex.dispose?.()
              }
              mat.dispose()
            }
          })
          renderer.dispose()
          renderer.domElement.remove()
        }
      } catch (e) {
        if (!disposed) setError(`Could not show this model: ${(e as Error).message}`)
      }
    })()

    return () => {
      disposed = true
      cleanup()
    }
  }, [data, filename, format])

  const toggleWire = () => {
    ctl.current.wireframe(!wire)
    setWire(!wire)
  }
  const toggleSpin = () => {
    ctl.current.spin(!spin)
    setSpin(!spin)
  }

  return (
    <div className="model-wrap">
      <div ref={host} className="model-host" />
      {error ? (
        <p className="error">{error}</p>
      ) : (
        <>
          <div className="row">
            <button className="ghost small" onClick={() => ctl.current.reset()}>
              Reset view
            </button>
            <button className="ghost small" aria-pressed={wire} onClick={toggleWire}>
              {wire ? 'Solid' : 'Wireframe'}
            </button>
            <button className="ghost small" aria-pressed={spin} onClick={toggleSpin}>
              {spin ? 'Stop turning' : 'Turn'}
            </button>
          </div>
          <p className="muted">
            {stats} {stats && '· '}
            {format ? FORMAT_NOTE[format] : ''} · drag to rotate, pinch to zoom
          </p>
        </>
      )}
    </div>
  )
}
