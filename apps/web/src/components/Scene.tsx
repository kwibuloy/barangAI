import type { CSSProperties } from 'react'
import { cn } from '@/lib/utils'

const depth = (value: number) => ({ '--depth': value }) as CSSProperties

/**
 * A flat barangay landscape (rolling hills, houses, the hall with its flag, sun and clouds) drawn as separate
 * layers. Inside a `.tilt` card each layer drifts at its own depth; elsewhere it is a still illustration.
 * Colours come from the --scene-* variables in styles.css, so it follows light and dark mode.
 */
export function Scene({ className, houses = true }: { className?: string; houses?: boolean }) {
  return (
    <div aria-hidden="true" className={cn('scene pointer-events-none absolute inset-0 overflow-hidden', className)}>
      <span data-depth className="scene-sun absolute top-[14%] right-[10%] size-24 rounded-full" style={depth(-0.4)} />
      <span data-depth className="absolute inset-0" style={depth(-0.25)}>
        <span className="scene-cloud absolute top-[10%] left-[56%] h-7 w-24" />
        <span className="scene-cloud scene-cloud-slow absolute top-[34%] left-[72%] h-5 w-16" />
      </span>
      <svg
        data-depth
        style={depth(0.15)}
        className="absolute inset-x-[-4%] bottom-0 h-[62%] w-[108%]"
        viewBox="0 0 720 200"
        preserveAspectRatio="none"
      >
        <path className="fill-[var(--scene-hill-1)]" d="M0 120 Q110 52 250 98 T520 80 T720 104 V200 H0Z" />
      </svg>
      {houses && (
        <svg
          data-depth
          style={depth(0.3)}
          className="absolute right-[3%] bottom-[20%] h-[24%] w-auto"
          viewBox="0 0 160 80"
        >
          {/* The barangay hall with its flag, between two houses. */}
          <g className="fill-[var(--scene-house)]">
            <path d="M4 52 L22 38 L40 52 V78 H4Z" />
            <path d="M58 44 L84 24 L110 44 V78 H58Z" />
            <path d="M124 54 L140 42 L156 54 V78 H124Z" />
            <rect x="83" y="2" width="2.5" height="24" />
          </g>
          <path className="fill-[var(--scene-flag)]" d="M85.5 3 h16 l-4 5 l4 5 h-16Z" />
          <g className="fill-[var(--scene-window)]">
            <rect x="14" y="56" width="6" height="6" rx="1" />
            <rect x="24" y="56" width="6" height="6" rx="1" />
            <rect x="66" y="52" width="8" height="8" rx="1.5" />
            <rect x="94" y="52" width="8" height="8" rx="1.5" />
            <path d="M78 78 v-12 a6 6 0 0 1 12 0 v12Z" />
            <rect x="134" y="60" width="6" height="6" rx="1" />
          </g>
        </svg>
      )}
      <svg
        data-depth
        style={depth(0.45)}
        className="absolute inset-x-[-4%] bottom-0 h-[42%] w-[108%]"
        viewBox="0 0 720 200"
        preserveAspectRatio="none"
      >
        <path className="fill-[var(--scene-hill-2)]" d="M0 140 Q170 70 340 120 T720 100 V200 H0Z" />
      </svg>
      <svg
        data-depth
        style={depth(0.8)}
        className="absolute inset-x-[-6%] bottom-0 h-[24%] w-[112%]"
        viewBox="0 0 720 200"
        preserveAspectRatio="none"
      >
        <path className="fill-[var(--scene-hill-3)]" d="M0 150 Q220 70 460 130 T720 110 V200 H0Z" />
      </svg>
    </div>
  )
}
