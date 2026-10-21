import { useState } from 'react'
import type { Decoded } from '../m3ds/codec'
import type { Expect } from '../m3ds/registry'
import { saveDecodedToLibrary } from './save'

type State = 'idle' | 'saving' | 'saved' | { error: string }

/** The explicit "keep this" action: nothing reaches the library without a tap here. */
export default function AddToLibraryButton({
  decoded,
  expect,
  nsfw,
  sourceJobId,
  name,
}: {
  decoded: Decoded
  expect?: Expect
  nsfw?: boolean
  sourceJobId?: string
  name?: string
}) {
  const [state, setState] = useState<State>('idle')
  const label =
    state === 'saving'
      ? 'Saving…'
      : state === 'saved'
        ? 'In your library'
        : typeof state === 'object'
          ? 'Retry'
          : 'Add to library'
  return (
    <>
      <button
        disabled={state === 'saving' || state === 'saved'}
        onClick={async () => {
          setState('saving')
          try {
            await saveDecodedToLibrary(decoded, { expect, nsfw, sourceJobId, name })
            setState('saved')
          } catch (e) {
            setState({ error: (e as Error).message })
          }
        }}
      >
        {label}
      </button>
      {typeof state === 'object' && (
        <p className="toast glass" role="alert">
          {state.error}
        </p>
      )}
    </>
  )
}
