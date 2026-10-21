import { useEffect, useMemo, useRef, useState } from 'react'
import { prefersReducedMotion } from '../../lib/motion'
import { parsePuppetBundle, PuppetError, type PuppetBundle } from '../../rig/puppet'
import { RigActor, rng, type Manual } from '../../rig/rigcore'
import type { ViewerProps } from './types'

type Look = 'auto' | 'left' | 'centre' | 'right'
const LOOK: Record<Look, { gazeX?: number; gazeY?: number }> = {
  auto: {},
  left: { gazeX: -1, gazeY: 0 },
  centre: { gazeX: 0, gazeY: 0 },
  right: { gazeX: 1, gazeY: 0 },
}

function Chips({
  label,
  options,
  value,
  onPick,
}: {
  label: string
  options: Array<[string, string]> // [value, shown]
  value: string
  onPick: (v: string) => void
}) {
  return (
    <div className="chip-group">
      <span className="chip-label">{label}</span>
      <div className="chip-row" role="group" aria-label={label}>
        {options.map(([v, shown]) => (
          <button
            key={v}
            type="button"
            className={`ghost small chip-btn${value === v ? ' on' : ''}`}
            aria-pressed={value === v}
            onClick={() => onPick(v)}
          >
            {shown}
          </button>
        ))}
      </div>
    </div>
  )
}

/** A live puppet: idle blinking and gaze, with controls to hold a mouth shape, brows, eyes and where it looks. */
export default function PuppetViewer({ data }: ViewerProps) {
  const parsed = useMemo<{ bundle: PuppetBundle } | { error: string }>(() => {
    try {
      return { bundle: parsePuppetBundle(data) }
    } catch (e) {
      return { error: e instanceof PuppetError ? e.message : 'This puppet could not be opened.' }
    }
  }, [data])

  const screen = useRef<HTMLCanvasElement>(null)
  const actor = useRef<RigActor | null>(null)
  const held = useRef<Manual>({})
  const talking = useRef(false)
  const regions = useRef(false)
  const redraw = useRef<() => void>(() => {})
  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [reduced] = useState(prefersReducedMotion)

  const [mouth, setMouth] = useState('auto')
  const [eyes, setEyes] = useState('auto')
  const [brows, setBrows] = useState('auto')
  const [look, setLook] = useState<Look>('auto')
  const [blink, setBlink] = useState(true)
  const [talk, setTalk] = useState(false)
  const [boxes, setBoxes] = useState(false)

  const bundle = 'bundle' in parsed ? parsed.bundle : null

  // build the actor and run the draw loop (a single frame per change when motion is reduced)
  useEffect(() => {
    if (!bundle) return
    let cancelled = false
    let raf = 0
    const start = performance.now()
    RigActor.fromBundle(bundle)
      .then((a) => {
        if (cancelled) return
        actor.current = a
        const cv = screen.current
        if (!cv) return
        cv.width = a.canvas.width
        cv.height = a.canvas.height
        const g = cv.getContext('2d')!
        const frame = (now: number) => {
          const t = (now - start) / 1000
          const m: Manual = { ...held.current }
          if (talking.current && bundle.parts.mouth.speech?.length) {
            const speech = bundle.parts.mouth.speech
            m.mouth = speech[Math.floor(rng(Math.floor(t * 9) + 1)() * speech.length)]
          }
          a.draw(null, t, {}, true, m)
          g.clearRect(0, 0, cv.width, cv.height)
          g.drawImage(a.canvas, 0, 0)
          if (regions.current) {
            g.lineWidth = Math.max(2, cv.width / 300)
            g.strokeStyle = '#ff8f7a'
            g.fillStyle = '#ff8f7a'
            g.font = `${Math.max(12, cv.width / 40)}px system-ui`
            for (const [name, p] of Object.entries(bundle.parts)) {
              g.strokeRect(p.box[0], p.box[1], p.box[2] - p.box[0], p.box[3] - p.box[1])
              g.fillText(name, p.box[0] + 4, p.box[1] + Math.max(14, cv.width / 40))
            }
          }
        }
        redraw.current = () => frame(performance.now())
        setReady(true)
        if (reduced) frame(start)
        else {
          const loop = (now: number) => {
            frame(now)
            raf = requestAnimationFrame(loop)
          }
          raf = requestAnimationFrame(loop)
        }
      })
      .catch((e: Error) => !cancelled && setLoadError(e.message))
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      actor.current = null
      redraw.current = () => {}
    }
  }, [bundle, reduced])

  // controls write into refs the loop reads; with reduced motion, redraw once for the change
  useEffect(() => {
    const next: Manual = { ...LOOK[look], noBlink: !blink }
    if (mouth !== 'auto') next.mouth = mouth
    if (eyes !== 'auto') next.eyes = eyes
    if (brows !== 'auto') next.brow_L = next.brow_R = brows
    held.current = next
    talking.current = talk && !reduced
    regions.current = boxes
    redraw.current()
  }, [mouth, eyes, brows, look, blink, talk, boxes, reduced, ready])

  if (!bundle) return <p className="error">{'error' in parsed ? parsed.error : ''}</p>
  if (loadError) return <p className="error">{loadError}</p>

  const frames = (part: string, skip: string[] = []) =>
    Object.keys(bundle.parts[part]?.frames ?? {})
      .filter((k) => !skip.includes(k))
      .map((k): [string, string] => [k, k.replace(/^idle_/, '').replace(/_/g, ' ')])
  const mouthSpeech = bundle.parts.mouth.speech ?? []
  const mouthIdle = bundle.parts.mouth.idle ?? []

  return (
    <div className="puppet-viewer">
      <div className="puppet-stage" style={{ aspectRatio: `${bundle.size[0]} / ${bundle.size[1]}` }}>
        <canvas ref={screen} aria-label={`Puppet ${bundle.name}`} role="img" />
        {!ready && <p className="muted puppet-loading">Loading the puppet…</p>}
      </div>
      <p className="muted">
        {bundle.name} · {Object.keys(bundle.parts).length} parts · {Object.keys(bundle.files).length} layers
        {reduced ? ' · motion is reduced, so it only redraws when you change something' : ''}
      </p>

      <Chips
        label="Mouth"
        value={mouth}
        onPick={setMouth}
        options={[
          ['auto', 'Auto'],
          ['X', 'Rest'],
          ...mouthSpeech.map((k): [string, string] => [k, k]),
          ...mouthIdle.map((k): [string, string] => [k, k.replace(/^idle_/, '')]),
        ]}
      />
      <Chips label="Eyes" value={eyes} onPick={setEyes} options={[['auto', 'Auto'], ...frames('eyes')]} />
      <Chips
        label="Brows"
        value={brows}
        onPick={setBrows}
        options={[['auto', 'Auto'], ...frames('brow_L', ['rest']).map(([k, s]): [string, string] => [k, s])]}
      />
      <Chips
        label="Look"
        value={look}
        onPick={(v) => setLook(v as Look)}
        options={[
          ['auto', 'Wander'],
          ['left', 'Left'],
          ['centre', 'Centre'],
          ['right', 'Right'],
        ]}
      />
      <div className="row puppet-toggles">
        <label className="toggle">
          <input type="checkbox" checked={blink} onChange={(e) => setBlink(e.target.checked)} />
          <span>Blink</span>
        </label>
        <label className="toggle">
          <input
            type="checkbox"
            checked={talk}
            disabled={reduced}
            onChange={(e) => setTalk(e.target.checked)}
          />
          <span>Talk demo</span>
        </label>
        <label className="toggle">
          <input type="checkbox" checked={boxes} onChange={(e) => setBoxes(e.target.checked)} />
          <span>Show regions</span>
        </label>
      </div>
    </div>
  )
}
