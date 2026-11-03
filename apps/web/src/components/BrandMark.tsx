/** App-icon style mark: the vest's eight-rayed sun on a blue squircle, legible at 20px. */
export function BrandMark({ size = 28 }: { size?: number }) {
  const rays = Array.from({ length: 8 }, (_, index) => index * 45)
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true" className="shrink-0">
      <defs>
        <linearGradient id="brand-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3b82f6" />
          <stop offset="1" stopColor="#1d4fbf" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="11" fill="url(#brand-fill)" />
      <g fill="#fff" transform="translate(24 24)">
        {rays.map(angle => (
          <path key={angle} d="M0-17 2.6-9.5h-5.2z" transform={`rotate(${angle})`} />
        ))}
        <circle r="7" />
      </g>
      <circle cx="24" cy="24" r="3.2" fill="#f0b429" />
    </svg>
  )
}

export function Wordmark({ textClassName }: { textClassName?: string }) {
  return (
    <span className="flex items-center gap-2.5 text-[17px] font-semibold tracking-tight">
      <BrandMark />
      <span className={textClassName}>BarangAI</span>
    </span>
  )
}
