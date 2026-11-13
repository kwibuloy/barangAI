import { LoaderCircle, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DateText } from '@/components/DateText'
import { Kap, kapAvailable } from '@/components/Kap'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Txt, useText } from '../../../lib/i18n'
import { label } from '../categories'
import { CategoryTile } from '../CategoryIcon'
import type { Nearby } from '../types'

/** "You already reported this": offered before a second report of the same issue is sent. */
export function NearbySheet({
  nearby,
  adding,
  onClose,
  onAddToOwn,
  onJoinCase,
  onSubmitAnyway,
}: {
  nearby: Nearby | null
  adding: boolean
  onClose: () => void
  onAddToOwn: (reportId: string) => void
  onJoinCase: (caseId: string) => void
  onSubmitAnyway: () => void
}) {
  const t = useText()
  const own = nearby?.own[0]
  const shared = own ? undefined : nearby?.cases[0]
  return (
    <Sheet open={Boolean(nearby)} onOpenChange={open => !open && onClose()}>
      <SheetContent
        side="bottom"
        className="mx-auto max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        <SheetHeader className="items-center px-5 pt-6 text-center">
          {kapAvailable('thinking') && <Kap pose="thinking" className="mb-1 h-24 w-auto" />}
          <SheetTitle className="text-[20px] font-bold">
            <Txt>{own ? 'You already reported this' : 'Neighbours already reported this'}</Txt>
          </SheetTitle>
          <SheetDescription className="text-[15px]">
            <Txt>
              {own
                ? 'Your open report is close to this pin. Add this photo and note to it so staff see everything in one place.'
                : 'Barangay staff are already working on an issue close to this pin. Add your photo to it as evidence.'}
            </Txt>
          </SheetDescription>
        </SheetHeader>
        {(own || shared) && (
          <div className="mx-5 flex items-center gap-3 rounded-2xl bg-muted/60 p-3.5">
            <CategoryTile category={(own?.resident_category ?? shared?.category)!} />
            <div className="min-w-0 flex-1 text-[14px]">
              <strong className="block truncate text-[15px] font-semibold">
                <Txt>{label(own?.resident_category ?? shared?.category ?? null)}</Txt>
              </strong>
              <span className="block text-muted-foreground">
                {own ? (
                  <>
                    #{own.id.slice(0, 8).toUpperCase()} ·{' '}
                    {own.created_at && <DateText value={own.created_at} compact />}
                  </>
                ) : (
                  <>
                    {shared?.location_label ?? ''} {shared?.contributors ?? 0} {t('residents')}
                  </>
                )}
                {' · '}
                {own?.distance_m ?? shared?.distance_m} m {t('away')}
              </span>
            </div>
          </div>
        )}
        <div className="flex flex-col gap-2.5 px-5 pt-2">
          {own && (
            <Button size="lg" disabled={adding} onClick={() => onAddToOwn(own.id)}>
              {adding && <LoaderCircle className="animate-spin" />}
              <Txt>Add to my report</Txt>
            </Button>
          )}
          {shared && (
            <Button size="lg" onClick={() => onJoinCase(shared.id)}>
              <Users />
              <Txt>Add my photo to this issue</Txt>
            </Button>
          )}
          <Button size="lg" variant="secondary" disabled={adding} onClick={onSubmitAnyway}>
            <Txt>It is a different problem. Send a new report</Txt>
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
