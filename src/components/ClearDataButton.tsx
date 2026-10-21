import { useState } from 'react'
import { clearAllDataAndReload } from '../security/wipe'
import Sheet from './ui/Sheet'

/** Confirmation in a sheet: wiping is not undoable. */
export default function ClearDataButton({ label = 'Clear all data on this device' }: { label?: string }) {
  const [armed, setArmed] = useState(false)
  return (
    <>
      <button className="ghost" onClick={() => setArmed(true)}>
        {label}
      </button>
      <Sheet open={armed} onClose={() => setArmed(false)} title="Clear everything?">
        <div className="confirm">
          <p className="error">
            This removes your API key, history, settings, PIN and your age/terms confirmation from this
            device. You will start again from the beginning.
          </p>
          <div className="row">
            <button onClick={() => void clearAllDataAndReload()}>Yes, clear everything</button>
            <button className="ghost" onClick={() => setArmed(false)}>
              Cancel
            </button>
          </div>
        </div>
      </Sheet>
    </>
  )
}
