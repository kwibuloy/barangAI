import type { CSSProperties } from 'react'

// Each leaf: where it starts across the screen, how long it takes to fall, its delay, size and colour. Fixed values
// (not random) keep the scene the same on every visit and in screenshots.
const LEAVES = [
  { x: 6, time: 13, delay: -2, size: 22, colour: '#58cc02' },
  { x: 17, time: 17, delay: -9, size: 16, colour: '#89e219' },
  { x: 29, time: 15, delay: -5, size: 26, colour: '#a5ed6e' },
  { x: 41, time: 19, delay: -14, size: 18, colour: '#58cc02' },
  { x: 55, time: 14, delay: -1, size: 20, colour: '#ffc800' },
  { x: 66, time: 18, delay: -11, size: 24, colour: '#89e219' },
  { x: 77, time: 16, delay: -6, size: 17, colour: '#58cc02' },
  { x: 88, time: 20, delay: -16, size: 22, colour: '#a5ed6e' },
  { x: 95, time: 15, delay: -8, size: 15, colour: '#ffc800' },
]

/** Leaves drifting down behind the sign-in card: the outer span falls, the inner one sways and spins. Off under
    reduced motion (auth.css). */
export function Leaves() {
  return (
    <div className="auth-leaves" aria-hidden="true">
      {LEAVES.map(leaf => (
        <span
          key={leaf.x}
          className="auth-leaf"
          style={
            {
              left: `${leaf.x}%`,
              '--fall': `${leaf.time}s`,
              '--delay': `${leaf.delay}s`,
              '--size': `${leaf.size}px`,
              color: leaf.colour,
            } as CSSProperties
          }
        >
          <svg viewBox="0 0 24 24">
            <path fill="currentColor" d="M4 20C4 10 10 4 21 3c0 11-6 17-16 17Z" />
            <path d="M5 19 15 9" fill="none" stroke="rgb(0 0 0 / 0.18)" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </span>
      ))}
    </div>
  )
}
