import type { SVGProps } from 'react'

// One small stroke icon set, drawn on a 24px grid. Inline so nothing is fetched and the CSP stays strict.
const PATHS = {
  chat: 'M21 12a8 8 0 0 1-11.7 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12Z',
  workflows: 'M4 7h9M17 7h3M4 17h3M11 17h9M13 4v6M7 14v6',
  queue: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  gallery:
    'M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6Zm0 11 5-5 4 4 3-3 4 4M9 9.5h.01',
  settings:
    'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7.4-2.2.9.7a.5.5 0 0 1 .1.6l-1.2 2a.5.5 0 0 1-.6.2l-1.1-.4a7 7 0 0 1-1.5.9l-.2 1.2a.5.5 0 0 1-.5.4h-2.4a.5.5 0 0 1-.5-.4l-.2-1.2a7 7 0 0 1-1.5-.9l-1.1.4a.5.5 0 0 1-.6-.2l-1.2-2a.5.5 0 0 1 .1-.6l.9-.7a7 7 0 0 1 0-1.8l-.9-.7a.5.5 0 0 1-.1-.6l1.2-2a.5.5 0 0 1 .6-.2l1.1.4a7 7 0 0 1 1.5-.9l.2-1.2a.5.5 0 0 1 .5-.4h2.4a.5.5 0 0 1 .5.4l.2 1.2a7 7 0 0 1 1.5.9l1.1-.4a.5.5 0 0 1 .6.2l1.2 2a.5.5 0 0 1-.1.6l-.9.7a7 7 0 0 1 0 1.8Z',
  send: 'M5 12h14M13 6l6 6-6 6',
  close: 'M6 6l12 12M18 6 6 18',
  check: 'M5 12.5 10 17.5 19 7.5',
  chevron: 'M9 6l6 6-6 6',
  trash: 'M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12',
  save: 'M12 4v11m0 0-4-4m4 4 4-4M5 20h14',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  retry: 'M4 12a8 8 0 0 1 14-5.3L20 9M20 4v5h-5M20 12a8 8 0 0 1-14 5.3L4 15M4 20v-5h5',
} as const

export type IconName = keyof typeof PATHS

export default function Icon({
  name,
  size = 24,
  ...rest
}: { name: IconName; size?: number } & Omit<SVGProps<SVGSVGElement>, 'name'>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  )
}
