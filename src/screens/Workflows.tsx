import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Workflow } from '../api/types'
import { classify, outputKinds, type OutputKind } from '../lib/schema'
import { visibleWorkflows } from '../lib/visibility'
import { EXPECT_LABELS, outputSpec, type Expect, type Overrides } from '../m3ds/registry'
import { noteRecent, setPrefs, toggleFavorite, usePrefs } from '../state/prefs'
import { useWorkflows } from '../state/useWorkflows'

const KIND_LABEL: Record<OutputKind, string> = {
  image: 'image',
  video: 'video',
  audio: 'audio',
  mesh: '3D mesh',
  text: 'text',
}

function kinds(w: Workflow): string {
  return outputKinds(w)
    .map((k) => KIND_LABEL[k])
    .join(' · ')
}

function autoLabel(w: Workflow): string {
  const s = outputSpec(w)
  return s ? `M3DS: ${EXPECT_LABELS[s.expect]}` : 'ordinary media'
}

function resultValue(w: Workflow, o: Overrides): string {
  if (!Object.prototype.hasOwnProperty.call(o, w.slug)) return 'auto'
  const v = o[w.slug]
  return v ? `${v.carrier}:${v.expect}` : 'none'
}

function withResultType(o: Overrides, slug: string, value: string): Overrides {
  const next = { ...o }
  if (value === 'auto') delete next[slug]
  else if (value === 'none') next[slug] = null
  else next[slug] = { carrier: 'm3ds', expect: value.split(':')[1] as Expect }
  return next
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
  const { favorites, recents, showAdult, outputOverrides } = usePrefs()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const navigate = useNavigate()

  const visible = useMemo(() => visibleWorkflows(workflows, showAdult), [workflows, showAdult])
  const bySlug = useMemo(() => new Map(visible.map((w) => [w.slug, w])), [visible])
  const matches = useMemo(() => {
    const t = q.trim().toLowerCase()
    return t
      ? visible.filter((w) => `${w.name} ${w.slug} ${w.description ?? ''}`.toLowerCase().includes(t))
      : visible
  }, [visible, q])

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
          <label className="result-type">
            <span className="muted">Result type</span>
            <select
              value={resultValue(w, outputOverrides)}
              onChange={(e) =>
                setPrefs({ outputOverrides: withResultType(outputOverrides, w.slug, e.target.value) })
              }
            >
              <option value="auto">Auto ({autoLabel(w)})</option>
              <option value="none">Ordinary images / video / audio</option>
              {(Object.keys(EXPECT_LABELS) as Expect[]).map((k) => (
                <option key={k} value={`m3ds:${k}`}>
                  M3DS: {EXPECT_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
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
        <span className="muted">
          {visible.length} workflows
          {workflows.length !== visible.length ? ` (${workflows.length - visible.length} adult hidden)` : ''}
        </span>
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
