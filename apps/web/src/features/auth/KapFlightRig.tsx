import { useId } from 'react'
import flight from '../../assets/kap-flight-approved-v2.png'
import { KapEyes } from './KapEyes'

export function KapFlightRig({ landing, blink, failed }: { landing: boolean; blink: boolean; failed: boolean }) {
  const id = useId().replace(/:/g, '')
  const image = <image href={flight} width="1536" height="1024" filter={`url(#${id}-alpha)`} />
  return (
    <svg className="auth-kap-flight" viewBox="0 0 1536 1024" data-landing={landing} aria-hidden="true">
      <defs>
        <filter id={`${id}-alpha`} x="0" y="0" width="100%" height="100%" colorInterpolationFilters="sRGB">
          <feComponentTransfer>
            <feFuncA type="table" tableValues="0 0 0 0 1 1 1 1 1" />
          </feComponentTransfer>
        </filter>
        <clipPath id={`${id}-left`}>
          <path d="M0 340 H500 V950 H0Z" />
        </clipPath>
        <clipPath id={`${id}-right`}>
          <path d="M1036 340 H1536 V950 H1036Z" />
        </clipPath>
        <clipPath id={`${id}-body`}>
          <path d="M480 600 H1056 V970 H480Z" />
        </clipPath>
        <clipPath id={`${id}-head`}>
          <path d="M380 0 H1150 V410 H1060 V590 L785 635 H750 L475 590 V410 H380Z" />
        </clipPath>
      </defs>
      <g className="kap-flight-hover">
        <g className="kap-flight-wing kap-flight-left" clipPath={`url(#${id}-left)`} data-layer="flight-left-wing">
          {image}
        </g>
        <g className="kap-flight-wing kap-flight-right" clipPath={`url(#${id}-right)`} data-layer="flight-right-wing">
          {image}
        </g>
        <g clipPath={`url(#${id}-body)`} data-layer="flight-body">
          {image}
        </g>
        <g className="kap-flight-head" data-layer="flight-head-hat">
          <g clipPath={`url(#${id}-head)`}>{image}</g>
          <g transform="translate(170 14) scale(.837)">
            <KapEyes blink={blink} expression={failed ? 'concern' : 'neutral'} flight />
          </g>
        </g>
      </g>
    </svg>
  )
}
