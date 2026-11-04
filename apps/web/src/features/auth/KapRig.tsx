import type { CSSProperties } from 'react'
import smile from '../../assets/kap/face-smile.webp'
import covered from '../../assets/kap/cover-7.webp'
import { KapBuddy, type KapGaze } from './KapBuddy'
import type { KapPhase } from './useKapPrivacy'

/** The two frames that must be ready before Kap appears, so a private moment never falls back to his open eyes. */
export const KAP_POSES = { neutral: smile, covered }

/**
 * Sign-in Kap, drawn only from the user's bust frames (KapBuddy): his eyes follow the cursor or the email caret
 * through the eight look frames, a hidden password plays the cover sequence up to one cheeky peeking eye, and a
 * shown password carries on to both eyes fully covered. Pointer tracking also leans the whole owl (auth.css).
 */
export function KapRig({
  phase,
  gaze = null,
  failed = false,
}: {
  phase: KapPhase
  gaze?: KapGaze | null
  failed?: boolean
}) {
  const hidden = phase === 'peek' || phase === 'covered'
  return (
    <div className="auth-kap-rig" data-phase={phase}>
      <div className="kap-rig-lean">
        <KapBuddy
          mood={phase === 'surprise' ? 'bright' : failed ? 'keen' : 'smile'}
          gaze={hidden || phase === 'surprise' ? null : gaze}
          cover={phase === 'covered' ? 7 : phase === 'peek' ? 4 : 0}
          preloadCover
          className="size-full"
        />
      </div>
      {phase === 'peek' && <Giggle />}
    </div>
  )
}

/** Three little yellow marks beside his hat while he peeks, like the "!" marks on his sticker sheet. */
function Giggle() {
  return (
    <svg className="kap-giggle" data-layer="giggle" viewBox="0 0 100 100" aria-hidden="true">
      {[
        [84, 14, -30],
        [90, 26, 0],
        [90, 40, 30],
      ].map(([x, y, angle], index) => (
        <g key={index} transform={`rotate(${angle + 60} ${x} ${y})`}>
          <rect
            x={x - 2.4}
            y={y - 6}
            width="4.8"
            height="12"
            rx="2.4"
            fill="#ffc800"
            stroke="#17120e"
            strokeWidth="1.2"
            style={{ '--i': index } as CSSProperties}
          />
        </g>
      ))}
    </svg>
  )
}
