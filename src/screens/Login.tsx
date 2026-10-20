import { useState } from 'react'
import { setApiKey } from '../api/storage'

export default function Login({ onDone }: { onDone: () => void }) {
  const [input, setInput] = useState('')
  return (
    <main className="page">
      <h1>Flotsam</h1>
      <p className="muted">An independent client for your Graydient account.</p>
      <input
        type="password"
        placeholder="API key"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        autoComplete="off"
      />
      <button
        disabled={!input.trim()}
        onClick={() => {
          setApiKey(input.trim())
          onDone()
        }}
      >
        Save key
      </button>
    </main>
  )
}
