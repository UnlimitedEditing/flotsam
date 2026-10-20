import { useState } from 'react'
import { TERMS, TERMS_DRAFT_NOTICE } from '../legal/terms'
import { acceptConsent } from '../state/consent'

/** Everything the app shows before the gate is this screen and nothing else. */
export default function Gate() {
  const [adult, setAdult] = useState(false)
  const [terms, setTerms] = useState(false)
  const [declined, setDeclined] = useState(false)

  if (declined) {
    return (
      <main className="page gate">
        <h1>Flotsam</h1>
        <p>You need to be 18 or older and accept the terms to use Flotsam.</p>
        <button onClick={() => setDeclined(false)}>Review the terms</button>
      </main>
    )
  }

  return (
    <main className="page gate">
      <h1>Before you continue</h1>
      <p className="muted">
        Flotsam can show adult and explicit content. Please read and confirm. {TERMS_DRAFT_NOTICE}
      </p>

      <div className="terms" tabIndex={0} aria-label="Terms and Content Policy">
        {TERMS.map((s) => (
          <section key={s.title}>
            <h2>{s.title}</h2>
            {s.body.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </section>
        ))}
      </div>

      <label className="toggle">
        <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} />
        <span>I am 18 or older.</span>
      </label>
      <label className="toggle">
        <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} />
        <span>I have read and accept the Terms and Content Policy above.</span>
      </label>

      <button disabled={!adult || !terms} onClick={() => void acceptConsent()}>
        Continue
      </button>
      <button className="ghost" onClick={() => setDeclined(true)}>
        I don&apos;t accept
      </button>
    </main>
  )
}
