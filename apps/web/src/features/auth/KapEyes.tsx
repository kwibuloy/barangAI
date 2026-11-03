import { useId } from 'react'

/** Eye geometry traced from the approved expression design; pupils stay clipped inside the sclera. */
export function KapEyes({
  expression = 'neutral',
  blink = false,
  flight = false,
}: {
  expression?: 'neutral' | 'surprise' | 'concern' | 'closed'
  blink?: boolean
  flight?: boolean
}) {
  const id = useId().replace(/:/g, '')
  const closed = blink || expression === 'closed'
  return (
    <g className={flight ? 'kap-eyes kap-flight-eyes' : 'kap-eyes'} data-expression={closed ? 'blink' : expression}>
      <defs>
        <linearGradient id={`${id}-cream`} x2="0" y2="1">
          <stop stopColor="#ffecd0" />
          <stop offset="1" stopColor="#f9dfb2" />
        </linearGradient>
        {[586, 830].map((cx, i) => (
          <clipPath key={cx} id={`${id}-eye-${i}`}>
            <ellipse cx={cx} cy="485" rx="77" ry="80" />
          </clipPath>
        ))}
      </defs>
      {[586, 830].map((cx, i) => (
        <g key={cx}>
          <ellipse cx={cx} cy="485" rx="91" ry="94" fill={`url(#${id}-cream)`} />
          {closed ? (
            <path
              d={`M${cx - 72} 493 Q${cx} 549 ${cx + 72} 493`}
              fill="none"
              stroke="#17120e"
              strokeWidth="12"
              strokeLinecap="round"
            />
          ) : (
            <>
              <ellipse cx={cx} cy="485" rx="81" ry="84" fill="#fffdf3" stroke="#17120e" strokeWidth="9" />
              <g clipPath={`url(#${id}-eye-${i})`}>
                <g className="kap-pupil" data-layer="pupil">
                  <ellipse
                    cx={i === 0 ? 615 : 800}
                    cy={expression === 'concern' ? 480 : 487}
                    rx={expression === 'surprise' ? 33 : expression === 'concern' ? 41 : 47}
                    ry={expression === 'surprise' ? 47 : expression === 'concern' ? 59 : 65}
                    fill="#090909"
                  />
                  <circle cx={i === 0 ? 600 : 785} cy="455" r="14" fill="white" />
                </g>
              </g>
            </>
          )}
        </g>
      ))}
      {expression === 'concern' && !closed && (
        <g data-layer="concern-beak">
          <ellipse cx="708" cy="580" rx="74" ry="89" fill={`url(#${id}-cream)`} />
          <path
            d="M660 551 Q708 514 756 551 Q765 574 740 585 Q708 595 676 585 Q652 574 660 551Z"
            fill="#ffcf00"
            stroke="#17120e"
            strokeWidth="8"
          />
          <path
            d="M677 585 Q708 607 739 585 Q722 614 708 614 Q692 611 677 585Z"
            fill="#ff9300"
            stroke="#17120e"
            strokeWidth="7"
          />
        </g>
      )}
    </g>
  )
}
