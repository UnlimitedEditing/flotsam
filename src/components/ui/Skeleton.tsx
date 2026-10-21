// Placeholder rows shown while content loads: a soft shimmer instead of an empty screen.
export default function Skeleton({ rows = 6, label = 'Loading' }: { rows?: number; label?: string }) {
  return (
    <div className="skeleton-list" role="status" aria-label={label}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton-row" style={{ animationDelay: `${i * 80}ms` }}>
          <span className="skeleton-line" style={{ width: `${55 + ((i * 17) % 35)}%` }} />
          <span className="skeleton-line short" />
        </div>
      ))}
    </div>
  )
}
