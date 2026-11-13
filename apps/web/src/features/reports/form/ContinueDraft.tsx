import { Button } from '@/components/ui/button'
import { DateText } from '@/components/DateText'
import { Kap } from '@/components/Kap'
import { LargeTitle } from '@/components/page'
import { ResidentAccount } from '../../../app/ResidentShell'
import { Txt, useText } from '../../../lib/i18n'
import { label } from '../categories'
import type { ReportDraft } from '../draft'
import { validCoordinates } from './shared'

/** Back on the Report tab with a report still unsent. The photo isn't shown here: it stays blurred until checked. */
export function ContinueDraft({
  draft,
  onContinue,
  onDiscard,
}: {
  draft: ReportDraft
  onContinue: () => void
  onDiscard: () => void
}) {
  const t = useText()
  const facts = [
    draft.category ? t(label(draft.category)) : '',
    draft.photo ? `${t('Photo')}: ${t('Added')}` : '',
    t(validCoordinates(draft.latitude, draft.longitude) ? 'Location set' : 'Location not set'),
  ].filter(Boolean)
  return (
    <div data-fit className="pt-3 lg:mx-auto lg:max-w-md lg:pt-0">
      <LargeTitle bar title={t('Make a report')} trailing={<ResidentAccount />} />
      <div className="flex flex-col items-center pt-4 text-center">
        <Kap pose="clipboard" motion="pop" className="h-28 w-auto sm:h-36" />
        <h2 className="display mt-3 text-[26px]">
          <Txt>Continue your report?</Txt>
        </h2>
        <p className="mt-2 text-[15px] font-bold">{facts.join(' · ')}</p>
        <p className="mt-1 text-[14px] text-muted-foreground">
          <Txt>Saved on this device</Txt> · <DateText value={new Date(draft.savedAt).toISOString()} compact />
        </p>
        <div className="mt-5 grid w-full gap-2.5">
          <Button size="lg" onClick={onContinue}>
            <Txt>Continue</Txt>
          </Button>
          <Button size="lg" variant="secondary" onClick={onDiscard}>
            <Txt>Start over</Txt>
          </Button>
        </div>
        <p className="mt-4 text-[13px] text-muted-foreground">
          <Txt>
            Your unsent report, with its photo, stays on this device until you send it, sign out, or 24 hours pass.
          </Txt>
        </p>
      </div>
    </div>
  )
}
