import type { CSSProperties } from 'react'
import { Link } from 'react-router'
import { m } from 'motion/react'
import { Button } from '@/components/ui/button'
import { Kap, kapAvailable } from '@/components/Kap'
import { cn } from '@/lib/utils'
import { Txt, useText } from '../../../lib/i18n'
import { Journey } from '../Journey'
import type { Report } from '../types'
import { EASE } from './shared'

/** After sending: the reference number, the path ahead, and what to do next. */
export function SuccessView({ report, onAnother }: { report: Report; onAnother: () => void }) {
  const t = useText()
  return (
    <div
      data-fit
      className="flex flex-col items-center pt-[calc(env(safe-area-inset-top)+8px)] text-center lg:mx-auto lg:max-w-md lg:pt-6"
    >
      {kapAvailable('cheer') ? (
        <m.div
          initial={{ scale: 0.6, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 18 }}
        >
          <span className="relative block">
            {/* A burst of sparkles around him, like Duolingo's lesson-complete moment. */}
            {[
              ['-left-6 top-4', '#ffc800'],
              ['-right-5 top-0', '#1cb0f6'],
              ['-left-3 bottom-6', '#ff9600'],
              ['-right-7 bottom-10', '#ce82ff'],
            ].map(([place, color], index) => (
              <svg
                key={place}
                viewBox="0 0 24 24"
                aria-hidden="true"
                className={cn('sparkle absolute size-6', place)}
                style={{ '--i': index, color } as CSSProperties}
              >
                <path fill="currentColor" d="M12 0c1 6 6 11 12 12-6 1-11 6-12 12-1-6-6-11-12-12C6 11 11 6 12 0z" />
              </svg>
            ))}
            <Kap pose="cheer" motion="greet" interactive className="h-28 w-auto sm:h-40 lg:h-44" />
          </span>
        </m.div>
      ) : (
        <svg className="size-24" viewBox="0 0 96 96" aria-hidden="true">
          <m.circle
            cx="48"
            cy="48"
            r="44"
            fill="var(--status-resolved)"
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 16 }}
            style={{ originX: '50%', originY: '50%' }}
          />
          <m.path
            d="M30 49 l12 12 l24 -26"
            fill="none"
            stroke="#fff"
            strokeWidth="7"
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ delay: 0.2, duration: 0.35, ease: EASE }}
          />
        </svg>
      )}
      <h1 className="display mt-2 text-[28px] lg:mt-3 lg:text-[30px]">
        <Txt>Report sent</Txt>
      </h1>
      <p role="status" className="mt-1 max-w-sm text-[16px] text-muted-foreground">
        <Txt>Report submitted. Barangay personnel will review it.</Txt>
      </p>
      <p className="mt-2 max-w-sm text-[13px] text-muted-foreground">
        <Txt>Sending a report does not guarantee a response or a date. If anyone is in danger, call 911.</Txt>
      </p>
      <div className="mt-3 w-full rounded-2xl border-2 border-b-4 bg-card p-3.5 pb-4 text-left lg:mt-5 lg:p-4 lg:pb-5">
        <span className="label-caps text-[12px] text-muted-foreground">
          <Txt>Reference no.</Txt>
        </span>
        <strong className="mt-0.5 block font-mono text-[24px] font-bold tracking-wider">
          {report.id.slice(0, 8).toUpperCase()}
        </strong>
        <div className="mt-3 border-t-2 pt-12" aria-label={t('Status path')} role="group">
          <Journey status="Pending" compact />
        </div>
        <p className="mt-3 text-[14px] text-muted-foreground lg:mt-4">
          <Txt>Track it anytime in My reports.</Txt>
        </p>
      </div>
      <div className="mt-3 grid w-full gap-2 lg:mt-4">
        <Button asChild size="lg" className="max-lg:min-h-12">
          <Link to={`/reports/${report.id}`}>
            <Txt>View my report</Txt>
          </Link>
        </Button>
        <Button variant="tinted" size="lg" className="max-lg:min-h-12" type="button" onClick={onAnother}>
          <Txt>Make another report</Txt>
        </Button>
      </div>
    </div>
  )
}
