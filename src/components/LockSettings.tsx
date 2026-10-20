import { useEffect, useState } from 'react'
import { biometricAvailable } from '../native/biometric'
import { isValidPin } from '../security/pin'
import { lockNow, pinChanged, pinService, usePinSet } from '../security/lock'
import { setPrefs, usePrefs } from '../state/prefs'

type Mode = 'idle' | 'set' | 'change' | 'remove'

const TIMEOUTS: Array<[number, string]> = [
  [0, 'Immediately'],
  [1, 'After 1 minute'],
  [5, 'After 5 minutes'],
  [15, 'After 15 minutes'],
  [-1, 'Only when the app is opened fresh'],
]

export default function LockSettings() {
  const pinSet = usePinSet()
  const { lockTimeoutMin, biometricUnlock } = usePrefs()
  const [bioAvailable, setBioAvailable] = useState(false)
  useEffect(() => {
    void biometricAvailable().then(setBioAvailable)
  }, [])
  const [mode, setMode] = useState<Mode>('idle')
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [msg, setMsg] = useState('')

  const reset = () => {
    setMode('idle')
    setCurrent('')
    setNext('')
    setConfirm('')
  }

  async function save() {
    setMsg('')
    try {
      if (mode === 'set' || mode === 'change') {
        if (!isValidPin(next)) return setMsg('A PIN is 4 to 8 digits.')
        if (next !== confirm) return setMsg('The two PINs do not match.')
      }
      if (mode === 'set') {
        await pinService.setPin(next)
        pinChanged(true)
        setMsg('PIN set. The app will lock when you leave it.')
        return reset()
      }
      const r =
        mode === 'change' ? await pinService.changePin(current, next) : await pinService.removePin(current)
      if (!r.ok) {
        return setMsg(
          r.reason === 'locked' || r.retryAfterMs > 0
            ? `Too many attempts. Try again in ${Math.ceil(r.retryAfterMs / 1000)} s.`
            : 'Wrong current PIN.',
        )
      }
      pinChanged(mode === 'change')
      setMsg(mode === 'change' ? 'PIN changed.' : 'PIN removed.')
      reset()
    } catch (e) {
      setMsg((e as Error).message)
    }
  }

  return (
    <div className="lock-settings">
      <p className="muted">
        A PIN keeps casual snoopers out. It is stored only on this device and cannot be recovered if you
        forget it (clearing all data is the only way back in). It is not strong security; the Android app will
        add fingerprint and face unlock.
      </p>

      {mode === 'idle' && !pinSet && <button onClick={() => setMode('set')}>Set a PIN</button>}
      {mode === 'idle' && pinSet && (
        <>
          <button onClick={lockNow}>Lock now</button>
          <div className="row">
            <button className="ghost" onClick={() => setMode('change')}>
              Change PIN
            </button>
            <button className="ghost" onClick={() => setMode('remove')}>
              Remove PIN
            </button>
          </div>
          {bioAvailable && (
            <label className="toggle">
              <input
                type="checkbox"
                checked={biometricUnlock}
                onChange={(e) => setPrefs({ biometricUnlock: e.target.checked })}
              />
              <span>Unlock with fingerprint or face (the PIN still works)</span>
            </label>
          )}
          <label className="result-type">
            <span className="muted">Lock</span>
            <select
              value={lockTimeoutMin}
              onChange={(e) => setPrefs({ lockTimeoutMin: Number(e.target.value) })}
            >
              {TIMEOUTS.map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </>
      )}

      {mode !== 'idle' && (
        <div className="options">
          {(mode === 'change' || mode === 'remove') && (
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              placeholder="Current PIN"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          )}
          {(mode === 'set' || mode === 'change') && (
            <>
              <input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                placeholder="New PIN (4-8 digits)"
                value={next}
                onChange={(e) => setNext(e.target.value)}
              />
              <input
                type="password"
                inputMode="numeric"
                autoComplete="off"
                placeholder="Repeat new PIN"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
              />
            </>
          )}
          <div className="row">
            <button onClick={() => void save()}>{mode === 'remove' ? 'Remove PIN' : 'Save'}</button>
            <button
              className="ghost"
              onClick={() => {
                reset()
                setMsg('')
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {msg && <p className="muted">{msg}</p>}
    </div>
  )
}
