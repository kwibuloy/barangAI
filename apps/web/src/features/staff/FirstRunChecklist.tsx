import { Circle, CircleCheckBig } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Txt } from '../../lib/i18n'
import { useManagedRewards } from '../rewards/queries'
import { PhoneAddress } from './AccountsPage'
import { useAdminBarangays, useStaffAccounts } from './queries'

/** Getting a barangay running, for administrators. Every line is read from real data, and the card leaves once the
    required ones are done: the reward is optional, so it never keeps the card up by itself. */
export function FirstRunChecklist({ reports }: { reports: number | undefined }) {
  const barangays = useAdminBarangays()
  const staff = useStaffAccounts()
  const rewards = useManagedRewards()
  if (!barangays.data || !staff.data || !rewards.data || reports === undefined) return null
  const steps = [
    {
      title: 'Barangays loaded',
      hint: 'Done once on this computer: python -m barangai.barangays with the barangay file. See docs/mobile.md.',
      done: barangays.data.length > 0,
    },
    {
      title: 'A staff account exists',
      hint: 'Add one under Staff accounts, and give them the temporary password in person.',
      done: staff.data.some(account => account.role === 'staff' && !account.disabled),
    },
    {
      title: 'A reward is in the shop (optional)',
      hint: 'Add one under Rewards, if your barangay offers them.',
      done: rewards.data.length > 0,
      optional: true,
    },
    {
      title: 'First report received',
      hint: "Set up a resident's phone with the address below, then send a test report.",
      done: reports > 0,
    },
  ]
  if (steps.every(step => step.done || step.optional)) return null
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>
          <Txt>Get your barangay started</Txt>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <ul className="space-y-3">
          {steps.map(step => (
            <li key={step.title} className="flex items-start gap-2.5 text-[15px]">
              {step.done ? (
                <CircleCheckBig className="mt-0.5 size-5 shrink-0 text-[var(--status-resolved)]" aria-hidden="true" />
              ) : (
                <Circle className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              )}
              <span className="min-w-0">
                <span className="block font-bold">
                  <span className="sr-only">
                    <Txt>{step.done ? 'Done:' : 'To do:'}</Txt>{' '}
                  </span>
                  <Txt>{step.title}</Txt>
                </span>
                {!step.done && (
                  <span className="block text-[14px] break-words text-muted-foreground">
                    <Txt>{step.hint}</Txt>
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
        <div className="space-y-2 border-t pt-3">
          <p className="label-caps text-[12px] text-muted-foreground">
            <Txt>Phone address</Txt>
          </p>
          <PhoneAddress />
        </div>
      </CardContent>
    </Card>
  )
}
