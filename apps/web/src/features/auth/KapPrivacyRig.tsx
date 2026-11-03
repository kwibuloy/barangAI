import { useId } from 'react'
import neutral from '../../assets/kap-neutral-approved-v2.png'
import covered from '../../assets/kap-cover-eyes-approved-v1.png'
import { KapEyes } from './KapEyes'

/** Non-destructive raster layers; masks and shoulder pivots are traceable in the approved 1416×1111 canvas. */
export function KapPrivacyRig({
  phase,
  blink = false,
  failed = false,
}: {
  phase: string
  blink?: boolean
  failed?: boolean
}) {
  const id = useId().replace(/:/g, '')
  const raised = ['covering', 'covered', 'turning-away', 'away', 'turning-back'].includes(phase)
  const closed = ['covering', 'covered', 'turning-away', 'away', 'turning-back', 'returning'].includes(phase)
  const image = (href: string) => <image href={href} width="1416" height="1111" />
  return (
    <svg className="auth-kap-rig" viewBox="0 0 1416 1111" aria-hidden="true" data-phase={phase} data-raised={raised}>
      <defs>
        <clipPath id={`${id}-body`}>
          <path d="M0 735 H1416 V845 H1048 L965 895 L994 1111 H422 L449 895 L365 845 H0 Z" />
        </clipPath>
        <clipPath id={`${id}-head`}>
          <path d="M0 0 H1416 V755 H0 Z" />
        </clipPath>
        <clipPath id={`${id}-left`}>
          <path d="M310 776 Q275 734 304 638 Q345 529 440 450 Q485 412 541 384 Q576 366 586 403 Q625 383 652 411 Q684 439 647 490 Q691 494 670 540 Q651 577 618 600 Q650 625 604 651 Q571 676 539 682 Q535 713 501 739 L444 780 Q377 807 310 776Z" />
        </clipPath>
        <clipPath id={`${id}-right`}>
          <path d="M1106 776 Q1141 734 1112 638 Q1071 529 976 450 Q931 412 875 384 Q840 366 830 403 Q791 383 764 411 Q732 439 769 490 Q725 494 746 540 Q765 577 798 600 Q766 625 812 651 Q845 676 877 682 Q881 713 915 739 L972 780 Q1039 807 1106 776Z" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id}-body)`} data-layer="torso">
        {image(neutral)}
      </g>
      <g className="kap-rig-head" data-layer="head-hat">
        <g clipPath={`url(#${id}-head)`}>{image(neutral)}</g>
        <KapEyes
          blink={blink && !closed}
          expression={phase === 'surprise' ? 'surprise' : closed ? 'closed' : failed ? 'concern' : 'neutral'}
        />
      </g>
      <g className="kap-rig-wing kap-rig-wing-left" data-layer="left-wing" clipPath={`url(#${id}-left)`}>
        {image(covered)}
      </g>
      <g className="kap-rig-wing kap-rig-wing-right" data-layer="right-wing" clipPath={`url(#${id}-right)`}>
        {image(covered)}
      </g>
    </svg>
  )
}
