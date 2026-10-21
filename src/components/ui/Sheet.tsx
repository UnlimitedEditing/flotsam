import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react'

const DISMISS_DISTANCE = 90
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'

/**
 * A bottom sheet: a dimmed backdrop and a panel that slides up. Closes with the backdrop, Escape, the handle
 * dragged down, or the Close control. Focus moves into it when it opens, stays inside while it is open, and
 * returns to where it came from. It stays mounted until its exit animation has played.
 */
export default function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
}) {
  const [mounted, setMounted] = useState(open)
  if (open && !mounted) setMounted(true)
  const panel = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState({ y: 0, on: false })
  const startY = useRef(0)
  const lastY = useRef(0)
  const active = useRef(false)

  useEffect(() => {
    if (!open) return
    const returnTo = document.activeElement as HTMLElement | null
    panel.current?.focus()
    return () => returnTo?.focus?.()
  }, [open])

  if (!mounted) return null

  const keydown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onClose()
      return
    }
    if (e.key !== 'Tab' || !panel.current) return
    const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
    if (items.length === 0) return e.preventDefault()
    const first = items[0]
    const last = items[items.length - 1]
    if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  const down = (e: PointerEvent<HTMLDivElement>) => {
    startY.current = e.clientY
    lastY.current = 0
    active.current = true
    setDrag({ y: 0, on: true })
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const move = (e: PointerEvent<HTMLDivElement>) => {
    if (!active.current) return
    const y = Math.max(0, e.clientY - startY.current) // only downwards
    lastY.current = y
    setDrag({ y, on: true })
  }
  const up = () => {
    if (!active.current) return
    active.current = false
    if (lastY.current > DISMISS_DISTANCE) onClose()
    setDrag({ y: 0, on: false })
  }

  const style = { '--sheet-y': `${drag.y}px`, '--sheet-o': 1 - Math.min(drag.y / 400, 1) } as CSSProperties

  return (
    <div
      className={`sheet-root${open ? '' : ' closing'}`}
      onAnimationEnd={(e) => {
        if (!open && e.animationName === 'sheet-fade-out') setMounted(false)
      }}
    >
      <div className="sheet-backdrop" onClick={onClose} />
      <div
        ref={panel}
        className={`sheet glass${drag.on ? ' dragging' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        style={style}
        onKeyDown={keydown}
      >
        <div
          className="sheet-grip"
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
          aria-hidden="true"
        >
          <span />
        </div>
        <h2 className="sheet-title">{title}</h2>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  )
}
