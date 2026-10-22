// The contract between the app and a vendored web tool embedded in a sandboxed same-origin iframe (a viewer with
// host 'frame', e.g. the Groove Box score player). The tool is OUR copy, shipped under /viewers/<name>/, never a
// remote page. Messages are plain structured-clone data over postMessage:
//
//   frame -> app   { type: 'hello' }                          the bridge script is installed and listening
//   app   -> frame { type: 'load', filename, bytes }          the decoded file (bytes: ArrayBuffer, transferred)
//   frame -> app   { type: 'loaded' }                         the tool opened it
//   frame -> app   { type: 'error', message }                 the tool could not open it
//   frame -> app   { type: 'save', filename, bytes }          the user asked to keep an edited copy
//
// The app checks the sender (the frame's own window, our own origin) and the shape of every message before using
// it; anything else is ignored. Documented for people adding a tool in docs/viewers.md.

export type HostToFrame = { type: 'load'; filename: string; bytes: ArrayBuffer }

export type FrameToHost =
  | { type: 'hello' }
  | { type: 'loaded' }
  | { type: 'error'; message: string }
  | { type: 'save'; filename: string; bytes: ArrayBuffer }

export const MAX_FRAME_BYTES = 64 * 1024 * 1024

/** A copy of the file for sending: the original stays usable by the app, the copy's buffer is transferred. */
export function loadMessage(filename: string, data: Uint8Array): HostToFrame {
  return { type: 'load', filename, bytes: data.slice().buffer }
}

interface Incoming {
  origin: string
  source: unknown
  data: unknown
}

/**
 * The message if it really came from the frame we embedded and has the expected shape, otherwise null.
 * `frameWindow` is `iframe.contentWindow`; `origin` is our own origin.
 */
export function parseFrameMessage(ev: Incoming, frameWindow: unknown, origin: string): FrameToHost | null {
  if (ev.origin !== origin || !frameWindow || ev.source !== frameWindow) return null
  const d = ev.data
  if (!d || typeof d !== 'object') return null
  const m = d as Record<string, unknown>
  switch (m.type) {
    case 'hello':
    case 'loaded':
      return { type: m.type }
    case 'error':
      return typeof m.message === 'string' ? { type: 'error', message: m.message.slice(0, 300) } : null
    case 'save':
      return typeof m.filename === 'string' &&
        m.filename.length > 0 &&
        m.filename.length <= 120 &&
        m.bytes instanceof ArrayBuffer &&
        m.bytes.byteLength > 0 &&
        m.bytes.byteLength <= MAX_FRAME_BYTES
        ? { type: 'save', filename: m.filename, bytes: m.bytes }
        : null
    default:
      return null
  }
}
