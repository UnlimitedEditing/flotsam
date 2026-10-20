import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Workflow } from '../api/types'
import { classify } from '../lib/schema'
import { noteRecent, toggleFavorite, usePrefs } from '../state/prefs'
import { useWorkflows } from '../state/useWorkflows'

function kinds(w: Workflow): string {
  const k: string[] = []
  if (w.supports_txt2img) k.push('text→image')
  if (w.supports_img2img) k.push('image→image')
  if (w.supports_txt2vid) k.push('text→video')
  if (w.supports_img2vid) k.push('image→video')
  if (w.supports_vid2vid) k.push('video→video')
  if (w.supports_txt2wav) k.push('audio')
  return k.join(' · ')
}

function inputsSummary(w: Workflow): string {
  const sc = classify(w)
  const parts: string[] = []
  if (sc.hasPrompt) parts.push('prompt')
  for (const m of sc.media) parts.push(m.label.toLowerCase())
  if (sc.size) parts.push('size')
  for (const o of sc.options) parts.push(o.label.toLowerCase())
  return `Inputs: ${parts.join(', ') || 'none'}`
}

export default function Workflows() {
  const { workflows, loading, error, refresh } = useWorkflows()
  const { favorites, recents } = usePrefs()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const navigate = useNavigate()

  const bySlug = useMemo(() => new Map(workflows.map((w) => [w.slug, w])), [workflows])
  const matches = useMemo(() => {
    const t = q.trim().toLowerCase()
    return t
      ? workflows.filter((w) => `${w.name} ${w.slug} ${w.description ?? ''}`.toLowerCase().includes(t))
      : workflows
  }, [workflows, q])

  const pick = (w: Workflow) => {
    noteRecent(w.slug)
    navigate(`/?wf=${encodeURIComponent(w.slug)}`)
  }

  const row = (w: Workflow) => (
    <li key={w.slug} className="wf">
      <div className="wf-main" onClick={() => setOpen(open === w.slug ? null : w.slug)}>
        <strong>{w.name}</strong>
        <span className="muted">{kinds(w) || w.slug}</span>
      </div>
      <button className="icon" aria-label="Favorite" onClick={() => toggleFavorite(w.slug)}>
        {favorites.includes(w.slug) ? '★' : '☆'}
      </button>
      <button className="small" onClick={() => pick(w)}>
        Use
      </button>
      {open === w.slug && (
        <div className="wf-detail">
          {w.description && <p>{w.description}</p>}
          <p className="muted">{inputsSummary(w)}</p>
          {w.avg_elapsed ? <p className="muted">Typical run: {Math.round(w.avg_elapsed)}s</p> : null}
        </div>
      )}
    </li>
  )

  const favs = favorites.map((s) => bySlug.get(s)).filter((w): w is Workflow => !!w)
  const rec = recents
    .map((s) => bySlug.get(s))
    .filter((w): w is Workflow => !!w && !favorites.includes(w.slug))

  return (
    <main className="page">
      <h1>Workflows</h1>
      <input type="search" placeholder="Search workflows" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="row">
        <button className="ghost" onClick={() => void refresh()} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
        <span className="muted">{workflows.length} workflows</span>
      </div>
      {error && <p className="error">{error}</p>}
      {!q && favs.length > 0 && (
        <>
          <h2>Favorites</h2>
          <ul className="list">{favs.map(row)}</ul>
        </>
      )}
      {!q && rec.length > 0 && (
        <>
          <h2>Recent</h2>
          <ul className="list">{rec.map(row)}</ul>
        </>
      )}
      <h2>{q ? `Results (${matches.length})` : 'All'}</h2>
      <ul className="list">{matches.slice(0, 200).map(row)}</ul>
      {matches.length > 200 && <p className="muted">Showing 200 of {matches.length}. Refine your search.</p>}
    </main>
  )
}
