import { useEffect, useState } from 'react'
import ClearDataButton from '../components/ClearDataButton'
import { biometricAuth, biometricAvailable } from '../native/biometric'
import { unlock, unlockWithBiometric } from '../security/lock'
import { usePrefs } from '../state/prefs'
import { useAppName } from '../state/discreet'

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9']

/** Shown instead of the whole app while locked. Nothing from the app is rendered behind it. */
export default function LockScreen() {
  const name = useAppName()
  const { biometricUnlock } = usePrefs()
  const [bio, setBio] = useState(false)
  const [pin, setPin] = useState('')
  const [message, setMessage] = useState('')
  const [retryAt, setRetryAt] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (retryAt <= Date.now()) return
    const t = setInterval(() => setNow(Date.now()), 500)
    return () => clearInterval(t)
  }, [retryAt])

  // Offer fingerprint/face (Android) when the user turned it on; the PIN always remains available.
  async function tryBiometric() {
    if (await biometricAuth('Unlock')) unlockWithBiometric()
  }

  useEffect(() => {
    if (!biometricUnlock) return
    let alive = true
    void biometricAvailable().then((ok) => {
      if (!alive || !ok) return
      setBio(true)
      void tryBiometric() // prompt straight away
    })
    return () => {
      alive = false
    }
  }, [biometricUnlock])

  const waitS = Math.max(0, Math.ceil((retryAt - now) / 1000))
  const blocked = waitS > 0

  async function submit() {
    if (pin.length < 4 || busy || blocked) return
    setBusy(true)
    const r = await unlock(pin)
    setBusy(false)
    setPin('')
    if (r.ok) return
    setNow(Date.now())
    if (r.retryAfterMs > 0) setRetryAt(Date.now() + r.retryAfterMs)
    setMessage(r.reason === 'locked' ? 'Too many attempts.' : 'Wrong PIN.')
  }

  return (
    <main className="page lock">
      <h1>{name}</h1>
      <p className="muted">Enter your PIN</p>
      <div className="dots" aria-label={`${pin.length} digits entered`}>
        {Array.from({ length: Math.max(4, pin.length) }, (_, i) => (
          <span key={i} className={i < pin.length ? 'dot on' : 'dot'} />
        ))}
      </div>
      {message && (
        <p className="error">
          {message}
          {blocked ? ` Try again in ${waitS} s.` : ''}
        </p>
      )}
      <div className="keypad">
        {KEYS.map((k) => (
          <button
            key={k}
            className="ghost"
            disabled={blocked || pin.length >= 8}
            onClick={() => setPin(pin + k)}
          >
            {k}
          </button>
        ))}
        <button className="ghost" onClick={() => setPin(pin.slice(0, -1))} aria-label="Delete">
          ⌫
        </button>
        <button className="ghost" disabled={blocked || pin.length >= 8} onClick={() => setPin(pin + '0')}>
          0
        </button>
        <button disabled={pin.length < 4 || blocked || busy} onClick={() => void submit()}>
          Unlock
        </button>
      </div>
      {bio && (
        <button className="ghost" onClick={() => void tryBiometric()}>
          Use fingerprint or face
        </button>
      )}
      <details className="forgot">
        <summary className="muted">Forgot your PIN?</summary>
        <p className="muted">
          A forgotten PIN cannot be recovered. The only way back in is to clear everything stored on this
          device.
        </p>
        <ClearDataButton label="Clear all data and start over" />
      </details>
    </main>
  )
}
