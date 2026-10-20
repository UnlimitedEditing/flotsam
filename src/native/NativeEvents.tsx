import { App as CapApp } from '@capacitor/app'
import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { jobIdFromUrl } from '../lib/shareTargets'
import { isNative } from './platform'
import { FlotsamNative } from './plugin'

/**
 * Android-only plumbing that needs the router: notification deep links (flotsam://job/<id>), images shared in
 * from other apps, and the hardware back button. Mounted inside the app shell, so none of it runs before the
 * age gate and the lock screen have been passed (a share that arrives earlier is held natively until then).
 */
export default function NativeEvents() {
  const navigate = useNavigate()
  const location = useLocation()
  const path = useRef(location.pathname)
  useEffect(() => {
    path.current = location.pathname
  }, [location.pathname])

  useEffect(() => {
    if (!isNative()) return
    const handles: Array<{ remove: () => Promise<void> }> = []
    let alive = true
    const keep = (h: { remove: () => Promise<void> }) => (alive ? handles.push(h) : void h.remove())

    const openJob = (url: string) => {
      const id = jobIdFromUrl(url)
      if (id) navigate(`/queue?job=${encodeURIComponent(id)}`)
    }

    void CapApp.addListener('appUrlOpen', (e) => openJob(e.url)).then(keep)
    void CapApp.getLaunchUrl().then((r) => r?.url && openJob(r.url))

    void CapApp.addListener('backButton', () => {
      if (path.current === '/') void CapApp.minimizeApp()
      else navigate(-1)
    }).then(keep)

    void FlotsamNative.addListener('shareReceived', () => navigate('/share')).then(keep)
    void FlotsamNative.sharedCount().then((r) => r.count > 0 && navigate('/share'))

    return () => {
      alive = false
      for (const h of handles) void h.remove()
    }
  }, [navigate])

  return null
}
