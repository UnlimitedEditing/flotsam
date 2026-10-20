import { useEffect, useState } from 'react'
import { heatClient, parseModelId, type Heat } from '../api/modeltrends'
import { setPrefs, usePrefs } from '../state/prefs'

// ModelTrends heat score for one workflow. Shown only while the workflow's detail is open (so we only ever
// request models the user looks at). The visible plain link beside the number is a condition of their terms:
// it is a normal <a href>, same size as the text around it, with no rel="nofollow"/tracking/redirect.
export default function HeatPanel({ slug }: { slug: string }) {
  const { modelTrendsIds } = usePrefs()
  const id = modelTrendsIds[slug]
  const [res, setRes] = useState<{ id: string; heat: Heat | null } | null>(null)
  const [input, setInput] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    if (!id) return
    let alive = true
    void heatClient.get(id).then((heat) => {
      if (alive) setRes({ id, heat })
    })
    return () => {
      alive = false
    }
  }, [id])

  const save = () => {
    const parsed = parseModelId(input)
    if (!parsed) {
      setErr('Paste the link of the model page on modeltrends.ai (it ends in an 8-character id).')
      return
    }
    setErr('')
    setInput('')
    setPrefs({ modelTrendsIds: { ...modelTrendsIds, [slug]: parsed } })
  }

  const clear = () => {
    const next = { ...modelTrendsIds }
    delete next[slug]
    setPrefs({ modelTrendsIds: next })
    setRes(null)
  }

  const heat = res && res.id === id ? res.heat : undefined

  return (
    <div className="heat">
      {id && heat === undefined && <p className="muted">Checking ModelTrends…</p>}
      {id && heat === null && (
        <p className="muted">
          No ModelTrends score for this model (not found, no data yet, or not listed).{' '}
          <button className="linkbtn" onClick={clear}>
            Remove link
          </button>
        </p>
      )}
      {heat && (
        <p>
          Heat {heat.score.toLocaleString()}° ({heat.tier}
          {heat.weekPct != null ? `, ${heat.weekPct >= 0 ? '+' : ''}${heat.weekPct}% this week` : ''}
          {heat.rank ? `, #${heat.rank.rank} of ${heat.rank.of.toLocaleString()}` : ''}){' '}
          <a href={heat.pageUrl} target="_blank">
            ModelTrends
          </a>{' '}
          <button className="linkbtn" onClick={clear}>
            Remove
          </button>
        </p>
      )}
      {!id && (
        <div className="heat-add">
          <input
            placeholder="ModelTrends page link (optional)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
          />
          <button className="ghost small" onClick={save} disabled={!input.trim()}>
            Add
          </button>
          {err && <p className="error">{err}</p>}
        </div>
      )}
    </div>
  )
}
