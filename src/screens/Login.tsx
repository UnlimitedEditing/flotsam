import { useState } from 'react'
import { setApiKey } from '../api/storage'
import { useAppName } from '../state/discreet'
import Logo from '../components/ui/Logo'

export default function Login({ onDone }: { onDone: () => void }) {
  const name = useAppName()
  const [input, setInput] = useState('')
  return (
    <main className="page hero">
      <Logo size={88} animated />
      <h1>{name}</h1>
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
