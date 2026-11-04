import { useId } from 'react'
import flight from '../../assets/kap-flight-approved-v2.webp'
import { KapEyes } from './KapEyes'

export const FLIGHT_POSE = flight

/** Kap on patrol while the sign-in request runs: the whole owl hovers and "beats" with a gentle horizontal stretch,
    so the art is never cut into wing layers. His eyes scan side to side. */
export function KapFlightRig({ landing, blink, failed }: { landing: boolean; blink: boolean; failed: boolean }) {
  const id = useId().replace(/:/g, '')
  return (
    <svg className="auth-kap-flight" viewBox="0 0 1536 1024" data-landing={landing} aria-hidden="true">
      <defs>
        {/* Snap the art's faint semi-transparent fringe to clear or solid, so no halo shows around him. */}
        <filter id={`${id}-alpha`} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feComponentTransfer>
            <feFuncA type="table" tableValues="0 0 0 0 1 1 1 1 1" />
          </feComponentTransfer>
        </filter>
      </defs>
      <g className="kap-flight-hover">
        <g className="kap-flight-beat">
          <image href={flight} width="1536" height="1024" filter={`url(#${id}-alpha)`} />
          <g transform="translate(170 14) scale(.837)">
            <KapEyes blink={blink} expression={failed ? 'concern' : 'neutral'} flight />
          </g>
        </g>
      </g>
    </svg>
  )
}
