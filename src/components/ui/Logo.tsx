// The Flotsam mark: a plank of driftwood riding a wave. The `animated` form bobs gently (transform only,
// and not at all under reduced motion; see .logo in index.css).
export default function Logo({ size = 64, animated = false }: { size?: number; animated?: boolean }) {
  return (
    <svg
      className={`logo${animated ? ' logo-animated' : ''}`}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      role="img"
      aria-label="Flotsam"
    >
      <defs>
        <linearGradient id="logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--accent)" />
          <stop offset="1" stopColor="var(--accent-2)" />
        </linearGradient>
      </defs>
      <g className="logo-plank">
        <rect
          x="14"
          y="24"
          width="30"
          height="7"
          rx="3.5"
          transform="rotate(-14 29 27.5)"
          fill="var(--warm)"
        />
        <circle cx="21" cy="28" r="1.4" fill="var(--bg)" opacity="0.55" />
      </g>
      <path
        className="logo-wave"
        d="M4 42c6 0 6-6 12-6s6 6 12 6 6-6 12-6 6 6 12 6 6-6 8-6v14c0 3-2 5-5 5H9c-3 0-5-2-5-5V42Z"
        fill="url(#logo-g)"
      />
    </svg>
  )
}
