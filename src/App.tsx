import { useState } from 'react'
import { fetchWorkflows } from './api/client'
import { clearApiKey, getApiKey, setApiKey } from './api/storage'
import type { Workflow } from './api/types'

export default function App() {
  const [key, setKey] = useState(getApiKey())
  const [input, setInput] = useState('')
  const [workflows, setWorkflows] = useState<Workflow[] | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function load() {
    setLoading(true)
    setError('')
    try {
      setWorkflows(await fetchWorkflows())
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  if (!key) {
    return (
      <main>
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
            setKey(input.trim())
          }}
        >
          Save key
        </button>
      </main>
    )
  }

  return (
    <main>
      <h1>Flotsam</h1>
      <div className="row">
        <button onClick={load} disabled={loading}>
          {loading ? 'Loading…' : 'List workflows'}
        </button>
        <button
          className="ghost"
          onClick={() => {
            clearApiKey()
            setKey('')
            setWorkflows(null)
          }}
        >
          Sign out
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {workflows && <p className="muted">{workflows.length} workflows</p>}
      <ul>
        {workflows?.map((w) => (
          <li key={w.id}>
            <strong>{w.name}</strong> <span className="muted">{w.slug}</span>
          </li>
        ))}
      </ul>
    </main>
  )
}
