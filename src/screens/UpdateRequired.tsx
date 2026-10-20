import UpdatePanel from '../components/UpdatePanel'
import { useAppName } from '../state/discreet'

/**
 * Shown instead of everything else when this version is below the minimum the update service still supports.
 * It sits before the age gate and the lock on purpose: updating must never depend on either.
 */
export default function UpdateRequired() {
  const name = useAppName()
  return (
    <main className="page">
      <h1>{name}</h1>
      <h2>Update required</h2>
      <p>This version is no longer supported. Please update to keep using the app.</p>
      <UpdatePanel forced />
    </main>
  )
}
