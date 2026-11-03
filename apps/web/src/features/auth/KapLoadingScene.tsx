import { useMemo } from 'react'
import { createPortal } from 'react-dom'
import { m } from 'motion/react'
import { KapFlightRig } from './KapFlightRig'
import covered from '../../assets/kap-cover-eyes-approved-v1.png'
import away from '../../assets/kap-turn-away-approved-v1.png'
import neutral from '../../assets/kap-neutral-approved-v2.png'

type Origin = { x: number; y: number; scale: number }
/** One full-screen decorative actor; the page owns the live loading announcement. */
export function KapLoadingScene({
  origin,
  landing,
  reduced,
  blink,
  privatePose,
}: {
  origin: Origin
  landing: boolean
  reduced: boolean
  blink: boolean
  privatePose: 'covered' | 'away' | 'neutral' | null
}) {
  const start = useMemo(() => ({ x: origin.x, y: origin.y, scale: origin.scale }), [origin])
  const target = reduced
    ? { x: 0, y: 0, scale: 1, opacity: 1, rotate: 0 }
    : landing
      ? { ...start, opacity: 0, rotate: 0 }
      : {
          x: [start.x, start.x * 0.28, 0],
          y: [start.y, -32, 0],
          scale: [start.scale, 1.035, 1],
          opacity: 1,
          rotate: [-2, 1, 0],
        }
  return createPortal(
    <div
      className="kap-loading-screen"
      data-private={privatePose ?? 'none'}
      data-reduced={reduced}
      data-landing={landing}
      aria-hidden="true"
    >
      <m.div
        className="kap-loading-backdrop"
        initial={{ opacity: reduced ? 1 : 0 }}
        animate={{ opacity: landing ? 0 : 1 }}
        transition={{ duration: reduced ? 0 : 0.32 }}
      />
      <div className="kap-loading-center">
        <m.div
          className="kap-loading-hero"
          initial={reduced ? false : { ...start, opacity: 1, rotate: -2 }}
          animate={target}
          transition={{
            duration: reduced ? 0 : landing ? 0.38 : 0.72,
            ease: [0.2, 0.8, 0.2, 1],
            times: landing ? undefined : [0, 0.75, 1],
          }}
        >
          {privatePose ? (
            <div className="kap-loading-private">
              <img
                src={privatePose === 'away' ? away : privatePose === 'neutral' ? neutral : covered}
                alt=""
                draggable={false}
              />
            </div>
          ) : (
            <KapFlightRig landing={false} blink={blink} failed={false} />
          )}
        </m.div>
      </div>
    </div>,
    document.body,
  )
}
