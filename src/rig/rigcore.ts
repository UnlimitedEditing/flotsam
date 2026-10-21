// The puppet renderer: a TypeScript port of Rig Studio's `player/lib/rigcore.js` (RigActor). One actor draws one
// puppet into its own canvas, transparent outside the head (the base's white background is keyed out once at load).
//
// Kept as close to the original as possible so the puppet looks exactly like it does in the Rig Studio player;
// the differences are deliberate and small:
//   - the actor is built from an already-validated bundle (src/rig/puppet.ts), not a raw buffer;
//   - `draw(...)` takes a `manual` argument so a viewer can hold a mouth shape, a brow pose, the eyes, the gaze
//     or switch idle blinking off;
//   - there is no Performance class yet (a track + audio player is a later slice), so `perf` is the minimal
//     interface the drawing code needs, and the viewer always passes null (idle).
import type { PuppetBundle } from './puppet'

// delivery -> per-part baseline (PUPPET_TABLE v1: written from acting sense, not fitted)
export const PUPPET_TABLE_VERSION = 1
interface Row {
  idle: string
  brow: [number, number]
  asym: number
  lid: number
  eyes: string | null
}
export const PUPPET_TABLE: Record<string, Row> = {
  neutral: { idle: 'neutral', brow: [0, 0], asym: 0, lid: 0, eyes: null },
  warm: { idle: 'warm', brow: [0.2, 0.1], asym: 0, lid: 0.1, eyes: null },
  playful: { idle: 'grin', brow: [0.35, 0], asym: 0.2, lid: 0, eyes: null },
  wry: { idle: 'smirk', brow: [0.1, 0], asym: 0.8, lid: 0.2, eyes: null },
  teasing: { idle: 'smirk', brow: [0.25, 0], asym: 0.6, lid: 0.1, eyes: null },
  excited: { idle: 'grin', brow: [0.6, 0], asym: 0, lid: 0, eyes: 'wide' },
  amazed: { idle: 'amazed', brow: [0.85, 0.1], asym: 0, lid: 0, eyes: 'wide' },
  delighted: { idle: 'grin', brow: [0.35, 0.1], asym: 0, lid: 0, eyes: 'squint' },
  earnest: { idle: 'confident', brow: [0.1, 0.35], asym: 0, lid: 0, eyes: null },
  confident: { idle: 'confident', brow: [-0.15, 0], asym: 0, lid: 0.25, eyes: null },
  proud: { idle: 'confident', brow: [0.15, 0], asym: 0.1, lid: 0.25, eyes: null },
  skeptical: { idle: 'skeptical', brow: [-0.1, 0], asym: 0.9, lid: 0.2, eyes: 'narrow' },
  concerned: { idle: 'worried', brow: [0.1, 0.7], asym: 0, lid: 0, eyes: null },
  sympathetic: { idle: 'worried', brow: [0.05, 0.5], asym: 0, lid: 0.15, eyes: null },
  deadpan: { idle: 'neutral', brow: [0, 0], asym: 0, lid: 0.5, eyes: null },
}
const INTENSITY: Record<string, number> = { slight: 0.55, clear: 1, strong: 1.35 }
const BROW_LADDER = ['frown2', 'frown1', 'rest', 'up1', 'up2', 'up3']
const LID_LADDER: Array<[string, number]> = [
  ['open', 0],
  ['lid25', 0.25],
  ['lid50', 0.5],
  ['lid75', 0.75],
  ['closed', 1],
]

export function rng(seed: number): () => number {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

type Curves = Record<string, number>
const v = (s: Curves, ch: string) => s[ch] || 0
const both = (s: Curves, a: string) => Math.max(v(s, a + '_L'), v(s, a + '_R'))

/** The part of a Performance the drawing code uses (a later slice ports the full class). */
export interface PerfLike {
  sample(t: number): Curves
  lineAt(t: number): { delivery: string; intensity?: string | null } | null
  speakingAt(t: number): boolean
  browPlanned(side: 'L' | 'R', t: number): [string, string]
  saccade(t: number): [number, number]
}

export interface DrawOpts {
  twos?: boolean
  head?: boolean
  useDirection?: boolean
  choreo?: boolean
  saccades?: boolean
  background?: string | null
}
export const DEFAULT_OPTS: Required<DrawOpts> = {
  twos: true,
  head: true,
  useDirection: true,
  choreo: true,
  saccades: true,
  background: null,
}

/** Held poses for a viewer: anything set overrides what the idle logic would pick. */
export interface Manual {
  mouth?: string
  eyes?: string
  brow_L?: string
  brow_R?: string
  gazeX?: number // -1..1
  gazeY?: number // -1..1
  noBlink?: boolean
}

interface Pick {
  t: number
  mouth: string
  eyes: string
  brow_L: string
  brow_R: string
  move?: string
}

const loadImg = (src: string): Promise<HTMLImageElement> =>
  new Promise((ok, bad) => {
    const im = new Image()
    im.onload = () => ok(im)
    im.onerror = () => bad(new Error('A puppet layer could not be decoded.'))
    im.src = src
  })

export class RigActor {
  rig!: Omit<PuppetBundle, 'files'>
  imgs: Record<string, HTMLImageElement> = {}
  canvas!: HTMLCanvasElement
  g!: CanvasRenderingContext2D
  off!: HTMLCanvasElement
  og!: CanvasRenderingContext2D
  base!: HTMLCanvasElement
  bounds!: [number, number, number, number]
  pick: Pick | null = null
  lastT = -1
  smooth = { bh: 0, bw: 0, asym: 0, lid: 0 }
  lastPerf: PerfLike | null = null

  static async fromBundle(bundle: PuppetBundle): Promise<RigActor> {
    const a = new RigActor()
    await a.load(bundle)
    return a
  }

  async load(bundle: PuppetBundle) {
    const { files, ...rig } = bundle
    this.imgs = {}
    await Promise.all(
      Object.entries(files).map(async ([f, b64]) => {
        this.imgs[f] = await loadImg('data:image/png;base64,' + b64)
      }),
    )
    this.rig = rig
    this.canvas = document.createElement('canvas')
    this.canvas.width = rig.size[0]
    this.canvas.height = rig.size[1]
    this.g = this.canvas.getContext('2d')!
    this.off = document.createElement('canvas')
    this.off.width = this.canvas.width
    this.off.height = this.canvas.height
    this.og = this.off.getContext('2d')!
    this.base = keyWhite(this.imgs[rig.base])
    this.bounds = alphaBounds(this.base) // the head's extent inside the canvas (for placing on stage)
    this.reset()
  }
  reset() {
    this.pick = null
    this.lastT = -1
    this.smooth = { bh: 0, bw: 0, asym: 0, lid: 0 }
    this.lastPerf = null
  }

  baseline(perf: PerfLike | null, t: number, o: Required<DrawOpts>) {
    const l = o.useDirection && perf ? perf.lineAt(t) : null
    const row = PUPPET_TABLE[l ? l.delivery : 'neutral'] || PUPPET_TABLE.neutral
    const k = l ? INTENSITY[l.intensity ?? ''] || 1 : 1
    return {
      line: l,
      idle: row.idle,
      bh: row.brow[0] * k,
      bw: row.brow[1] * k,
      asym: row.asym * k,
      lid: Math.min(0.6, row.lid * k),
      eyes: row.eyes,
    }
  }
  mouthShape(s: Curves) {
    const jaw = v(s, 'jawOpen'),
      pucker = v(s, 'mouthPucker'),
      funnel = v(s, 'mouthFunnel')
    const close = Math.max(v(s, 'mouthClose'), both(s, 'mouthPress')),
      roll = v(s, 'mouthRollLower')
    if (pucker > 0.45 && jaw < 0.2) return 'F'
    if (funnel > 0.22 || (pucker > 0.35 && jaw >= 0.2)) return 'E'
    if (roll > 0.15 && jaw < 0.2) return 'G'
    if (close > 0.1 || jaw < 0.06) return 'A'
    if (jaw > 0.33) return 'D'
    if (jaw > 0.2) return 'C'
    return 'B'
  }
  mouthPick(perf: PerfLike | null, s: Curves, t: number, b: { idle: string }) {
    const speaking = perf && perf.speakingAt(t),
      jaw = v(s, 'jawOpen')
    if (!speaking && jaw < 0.12) return this.rig.parts.mouth.frames['idle_' + b.idle] ? 'idle_' + b.idle : 'X'
    return this.mouthShape(s)
  }
  // brows: continuous height/tilt per side -> nearest pose, stepping at most one ladder rung per pick
  browTarget(s: Curves, side: 'L' | 'R', t: number, o: Required<DrawOpts>): string | null {
    const sgn = side === 'L' ? 1 : -1,
      sm = this.smooth
    let h =
      sm.bh + 1.6 * (v(s, 'browOuterUp_' + side) + 0.5 * v(s, 'browInnerUp')) - 2.2 * v(s, 'browDown_' + side)
    const w = sm.bw + 1.4 * v(s, 'browInnerUp') - 0.6 * v(s, 'browOuterUp_' + side)
    if (!o.choreo)
      h +=
        0.09 * Math.sin(t * (side === 'L' ? 1.9 : 2.3) + (side === 'L' ? 0 : 1.7)) +
        0.05 * Math.sin(t * 5.3 + (side === 'L' ? 0.4 : 2.9)) // independent slow drift per brow
    h += sgn * sm.asym * 0.45
    if (sm.asym > 0.45) return side === 'L' ? 'skeptical' : h < 0.2 ? 'skeptical' : null
    if (w > 0.45 && h < 0.55) return 'worried'
    // v1 thresholds (.2/.48/.78) held up3 ("astonished") 14% of real1 -- reserve it for real peaks
    if (h > 1.0) return 'up3'
    if (h > 0.6) return 'up2'
    if (h > 0.25) return 'up1'
    if (h < -0.6) return 'frown2'
    if (h < -0.22) return 'frown1'
    return 'rest'
  }
  static stepLadder(prev: string, want: string) {
    const a = BROW_LADDER.indexOf(prev),
      b = BROW_LADDER.indexOf(want)
    if (a < 0 || b < 0 || Math.abs(a - b) <= 1) return want
    return BROW_LADDER[a + Math.sign(b - a)]
  }
  eyesPick(s: Curves, b: { eyes: string | null }) {
    const blink = both(s, 'eyeBlink')
    const lid = Math.max(blink, this.smooth.lid)
    if (lid < 0.15) {
      if (b.eyes === 'wide' || both(s, 'eyeWide') > 0.12) return 'wide'
      if (b.eyes === 'squint' && both(s, 'mouthSmile') > 0.25) return 'squint'
      if (b.eyes === 'narrow') return 'narrow'
    }
    let best = 'open',
      d = 9
    for (const [k, x] of LID_LADDER)
      if (Math.abs(lid - x) < d) {
        d = Math.abs(lid - x)
        best = k
      }
    return best
  }
  // idle (no line playing): seeded blinks every ~2.5-5.5 s, a slow gaze wander
  idleCurves(t: number): Curves {
    const s: Curves = {},
      period = 4,
      k = Math.floor(t / period),
      r = rng(k * 7919 + 13)
    const tb = k * period + r() * (period - 0.3)
    if (t >= tb && t < tb + 0.13) {
      s.eyeBlink_L = s.eyeBlink_R = 1
    }
    s.gazeX = 0.25 * Math.sin(t * 0.37 + 1.3)
    s.gazeY = 0.12 * Math.sin(t * 0.23)
    return s
  }

  /** Draw the puppet at local time t of performance perf (null = idle at time t); `playing` = the clock is running. */
  draw(perf: PerfLike | null, t: number, opts: DrawOpts = {}, playing = true, manual: Manual = {}) {
    const o = { ...DEFAULT_OPTS, ...opts },
      rig = this.rig,
      g = this.g
    if (perf !== this.lastPerf) {
      this.pick = null
      this.lastT = -1
      this.lastPerf = perf
    }
    let s: Curves, b: ReturnType<RigActor['baseline']>
    if (perf) {
      s = perf.sample(t)
      b = this.baseline(perf, t, o)
    } else {
      s = this.idleCurves(t)
      b = this.baseline(null, t, o)
    }
    if (manual.noBlink) s.eyeBlink_L = s.eyeBlink_R = 0
    if (manual.gazeX !== undefined) s.gazeX = manual.gazeX / 1.6
    if (manual.gazeY !== undefined) s.gazeY = -manual.gazeY / 1.6
    const dt = Math.min(0.2, Math.max(0, t - this.lastT)),
      a = 1 - Math.exp(-dt / 0.35) // ease the baseline between lines
    for (const k of ['bh', 'bw', 'asym', 'lid'] as const)
      this.smooth[k] += (b[k] - this.smooth[k]) * (this.lastT < 0 || Math.abs(t - this.lastT) > 1 ? 1 : a)
    const step = o.twos ? 1 / 15 : 0
    if (!this.pick || Math.abs(t - this.pick.t) >= step || !playing) {
      const prev = this.pick || { brow_L: 'rest', brow_R: 'rest' }
      const bl = this.browTarget(s, 'L', t, o),
        br = this.browTarget(s, 'R', t, o)
      this.pick = {
        t,
        mouth: this.mouthPick(perf, s, t, b),
        eyes: this.eyesPick(s, b),
        brow_L: RigActor.stepLadder(prev.brow_L, bl || 'rest'),
        brow_R: RigActor.stepLadder(prev.brow_R, br || 'rest'),
      }
      if (o.choreo && perf) {
        const [pl, mv] = perf.browPlanned('L', t),
          [pr] = perf.browPlanned('R', t)
        this.pick.brow_L = pl
        this.pick.brow_R = pr
        this.pick.move = mv
      }
    }
    this.lastT = t
    // a held pose wins over whatever the idle logic picked (the cached pick itself is left alone)
    const pick: Pick = { ...this.pick }
    if (manual.mouth) pick.mouth = manual.mouth
    if (manual.eyes) pick.eyes = manual.eyes
    if (manual.brow_L) pick.brow_L = manual.brow_L
    if (manual.brow_R) pick.brow_R = manual.brow_R

    const W = this.canvas.width,
      H = this.canvas.height
    g.setTransform(1, 0, 0, 1, 0, 0)
    if (o.background) {
      g.fillStyle = o.background
      g.fillRect(0, 0, W, H)
    } else g.clearRect(0, 0, W, H)
    if (o.head && perf) {
      const px = W / 2,
        py = rig.parts.mouth.box[3] + 0.18 * H
      g.translate(px + v(s, 'headYaw') * 0.004 * W, py + v(s, 'headPitch') * 0.003 * H)
      g.rotate((-v(s, 'headRoll') * Math.PI) / 180)
      g.translate(-px, -py)
    }
    g.drawImage(this.base, 0, 0)
    for (const part of rig.draw_order) {
      if (part === 'pupils') {
        this.drawPupils(s, t, perf, o, pick)
        continue
      }
      const p = rig.parts[part]
      if (!p) continue
      const key = (pick as unknown as Record<string, string>)[part]
      const f = p.frames[key] || (p.rest ? p.frames[p.rest] : undefined)
      if (f) g.drawImage(this.imgs[f], p.box[0], p.box[1])
    }
    return { pick, baseline: b }
  }
  drawPupils(s: Curves, t: number, perf: PerfLike | null, o: Required<DrawOpts>, pick: Pick) {
    const rig = this.rig,
      e = rig.parts.eyes,
      clipFile = e.pupils && e.pupils[pick.eyes]
    if (!clipFile || clipFile === 'baked' || !rig.pupils.length) return
    const [sx, sy] = o.saccades && perf ? perf.saccade(t) : [0, 0]
    const gx = Math.max(-1, Math.min(1, v(s, 'gazeX') * 1.6 + sx)),
      gy = Math.max(-1, Math.min(1, -v(s, 'gazeY') * 1.6 + sy))
    const og = this.og
    og.setTransform(1, 0, 0, 1, 0, 0)
    og.clearRect(0, 0, this.off.width, this.off.height)
    // pupils first, THEN cut to the eye whites: "source-in" per pupil would wipe the previous pupil
    og.globalCompositeOperation = 'source-over'
    for (const p of rig.pupils)
      og.drawImage(this.imgs[p.file], p.box[0] + gx * p.range[0], p.box[1] + gy * p.range[1])
    og.globalCompositeOperation = 'destination-in'
    og.drawImage(this.imgs[clipFile], e.box[0], e.box[1]) // eye-white clip (alpha = inside the whites)
    og.globalCompositeOperation = 'source-over'
    this.g.drawImage(this.off, 0, 0)
  }
}

// the base's white background -> transparent (flood fill from the border, so whites inside the head stay)
function keyWhite(im: HTMLImageElement): HTMLCanvasElement {
  const cv = document.createElement('canvas')
  cv.width = im.width
  cv.height = im.height
  const g = cv.getContext('2d')!
  g.drawImage(im, 0, 0)
  const d = g.getImageData(0, 0, cv.width, cv.height),
    px = d.data,
    W = cv.width,
    H = cv.height
  const seen = new Uint8Array(W * H),
    stack: number[] = []
  const white = (i: number) => px[i * 4] > 235 && px[i * 4 + 1] > 235 && px[i * 4 + 2] > 235
  for (let x = 0; x < W; x++) stack.push(x, (H - 1) * W + x)
  for (let y = 0; y < H; y++) stack.push(y * W, y * W + W - 1)
  while (stack.length) {
    const i = stack.pop()!
    if (seen[i] || !white(i)) continue
    seen[i] = 1
    px[i * 4 + 3] = 0
    const x = i % W,
      y = (i / W) | 0
    if (x > 0) stack.push(i - 1)
    if (x < W - 1) stack.push(i + 1)
    if (y > 0) stack.push(i - W)
    if (y < H - 1) stack.push(i + W)
  }
  g.putImageData(d, 0, 0)
  return cv
}
function alphaBounds(cv: HTMLCanvasElement): [number, number, number, number] {
  const d = cv.getContext('2d')!.getImageData(0, 0, cv.width, cv.height).data,
    W = cv.width,
    H = cv.height
  let x0 = W,
    y0 = H,
    x1 = 0,
    y1 = 0
  for (let y = 0; y < H; y += 2)
    for (let x = 0; x < W; x += 2)
      if (d[(y * W + x) * 4 + 3] > 20) {
        if (x < x0) x0 = x
        if (x > x1) x1 = x
        if (y < y0) y0 = y
        if (y > y1) y1 = y
      }
  return x1 > x0 ? [x0, y0, x1 + 1, y1 + 1] : [0, 0, W, H]
}
