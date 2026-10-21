import { useEffect, useRef, useState } from 'react'
import type { ViewerProps } from './types'

// three.js is imported dynamically so the 3D code only loads when a model is actually opened.
export default function ModelViewer({ data }: ViewerProps) {
  const host = useRef<HTMLDivElement>(null)
  const resetRef = useRef<() => void>(() => {})
  const [error, setError] = useState('')
  const [stats, setStats] = useState('')

  useEffect(() => {
    let disposed = false
    let cleanup = () => {}

    void (async () => {
      const el = host.current
      if (!el) return
      try {
        const THREE = await import('three')
        const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
        const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js')
        if (disposed) return

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        el.appendChild(renderer.domElement)
        renderer.domElement.style.width = '100%'
        renderer.domElement.style.height = '100%'
        renderer.domElement.style.touchAction = 'none'

        const scene = new THREE.Scene()
        scene.add(new THREE.HemisphereLight(0xffffff, 0x444455, 1.6))
        const sun = new THREE.DirectionalLight(0xffffff, 2)
        sun.position.set(3, 5, 4)
        scene.add(sun)

        const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000)
        const controls = new OrbitControls(camera, renderer.domElement)
        controls.enableDamping = true

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

        const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
        const gltf = await new Promise<{ scene: import('three').Object3D }>((resolve, reject) =>
          new GLTFLoader().parse(buffer, '', resolve, reject),
        )
        if (disposed) {
          renderer.dispose()
          return
        }
        scene.add(gltf.scene)

        const box = new THREE.Box3().setFromObject(gltf.scene)
        const centre = box.getCenter(new THREE.Vector3())
        const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 0.001)
        let tris = 0
        gltf.scene.traverse((o) => {
          const m = o as import('three').Mesh
          if (m.isMesh && m.geometry) {
            const g = m.geometry
            tris += (g.index ? g.index.count : (g.attributes.position?.count ?? 0)) / 3
          }
        })
        setStats(`${Math.round(tris).toLocaleString()} triangles`)

        const frame = () => {
          camera.near = radius / 100
          camera.far = radius * 100
          camera.position
            .copy(centre)
            .add(new THREE.Vector3(1, 0.6, 1).normalize().multiplyScalar(radius * 2.6))
          camera.updateProjectionMatrix()
          controls.target.copy(centre)
          controls.update()
        }
        frame()
        resetRef.current = frame

        let raf = 0
        const loop = () => {
          controls.update()
          renderer.render(scene, camera)
          raf = requestAnimationFrame(loop)
        }
        loop()

        cleanup = () => {
          cancelAnimationFrame(raf)
          ro.disconnect()
          controls.dispose()
          scene.traverse((o) => {
            const m = o as import('three').Mesh
            m.geometry?.dispose?.()
            const mats = Array.isArray(m.material) ? m.material : m.material ? [m.material] : []
            for (const mat of mats) {
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
  }, [data])

  return (
    <div className="model-wrap">
      <div ref={host} className="model-host" />
      {error ? (
        <p className="error">{error}</p>
      ) : (
        <div className="row">
          <button className="ghost small" onClick={() => resetRef.current()}>
            Reset view
          </button>
          <span className="muted">{stats} · drag to rotate, pinch to zoom</span>
        </div>
      )}
    </div>
  )
}
