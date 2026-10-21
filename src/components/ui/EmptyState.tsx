import type { ReactNode } from 'react'
import Icon, { type IconName } from './Icon'

/** Slow drifting shapes behind an empty screen: wreckage on the tide. Decorative, transform-only, frozen by reduced motion. */
export function Drift() {
  return (
    <div className="drift" aria-hidden="true">
      <span className="d d1" />
      <span className="d d2" />
      <span className="d d3" />
      <span className="d d4 plank" />
      <span className="d d5" />
      <span className="d d6 plank" />
    </div>
  )
}

export default function EmptyState({
  icon,
  title,
  children,
}: {
  icon: IconName
  title: string
  children?: ReactNode
}) {
  return (
    <div className="empty-state">
      <Drift />
      <div className="empty-icon">
        <Icon name={icon} size={30} />
      </div>
      <h2 className="empty-title">{title}</h2>
      <div className="empty-body">{children}</div>
    </div>
  )
}
