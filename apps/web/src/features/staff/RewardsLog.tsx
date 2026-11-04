import { useState, type FormEvent } from 'react'
import { DateText } from '@/components/DateText'
import { Alert } from '@/components/page'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Txt, useText } from '../../lib/i18n'
import { useRewardsLog, useStaffAccounts, type RewardChangeLog, type VoucherLog } from './queries'

const FIELD: Record<string, string> = {
  name: 'Reward name',
  points_cost: 'Points',
  stock: 'Stock',
  partner: 'Partner',
  description: 'Description',
  active: 'In the shop',
}
const STATUS: Record<VoucherLog['status'], string> = { active: 'Active', used: 'Used', expired: 'Expired' }
const cell = 'whitespace-normal'

function useShown() {
  const t = useText()
  return (value: unknown) =>
    value === null || value === undefined || value === ''
      ? '—'
      : typeof value === 'boolean'
        ? t(value ? 'Yes' : 'No')
        : String(value)
}

/** "Points: 100 → 250" for a change; the starting values for a new reward. */
function ChangeText({ item }: { item: RewardChangeLog }) {
  const t = useText()
  const shown = useShown()
  return (
    <ul className="space-y-0.5">
      {Object.entries(item.changes).map(([field, value]) => (
        <li key={field}>
          {t(FIELD[field] ?? field)}: {Array.isArray(value) ? `${shown(value[0])} → ${shown(value[1])}` : shown(value)}
        </li>
      ))}
    </ul>
  )
}

/** Who priced each reward and, for any code, who redeemed and honoured it. Administrators only (the API checks). */
export function RewardsLog() {
  const t = useText()
  const [typed, setTyped] = useState('')
  const [code, setCode] = useState('')
  const log = useRewardsLog(code)
  const staff = useStaffAccounts()
  const emails = new Map((staff.data ?? []).map(account => [account.id, account.email]))
  // Residents appear as a short account id; their emails stay out of this list.
  const who = (id: string | null) => (id ? (emails.get(id) ?? `#${id.slice(0, 8).toUpperCase()}`) : '—')
  function submit(event: FormEvent) {
    event.preventDefault()
    setCode(typed.trim())
  }
  return (
    <section className="edge space-y-4 rounded-2xl p-4">
      <h2 className="text-[17px] font-extrabold">
        <Txt>Rewards log</Txt>
      </h2>
      <form onSubmit={submit} className="flex flex-wrap gap-2">
        <Input
          aria-label={t('Find a code')}
          placeholder={t('Find a code')}
          value={typed}
          maxLength={40}
          onChange={event => setTyped(event.target.value)}
          className="min-w-40 flex-1 uppercase placeholder:normal-case"
        />
        <Button type="submit" variant="secondary" className="grow basis-auto">
          <Txt>Find</Txt>
        </Button>
        {code && (
          <Button
            type="button"
            variant="ghost"
            className="grow basis-auto"
            onClick={() => {
              setTyped('')
              setCode('')
            }}
          >
            <Txt>Show all codes</Txt>
          </Button>
        )}
      </form>
      {log.error && (
        <Alert>
          <Txt>{log.error.message}</Txt>
        </Alert>
      )}
      <div className="space-y-2">
        <h3 className="label-caps text-[12px] text-muted-foreground">
          <Txt>Codes</Txt>
        </h3>
        {log.data?.vouchers.length === 0 ? (
          <p className="text-[14px] text-muted-foreground">
            <Txt>{code ? 'No code matches.' : 'No codes yet.'}</Txt>
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <Txt>Code</Txt>
                </TableHead>
                <TableHead>
                  <Txt>Reward</Txt>
                </TableHead>
                <TableHead>
                  <Txt>Status</Txt>
                </TableHead>
                <TableHead>
                  <Txt>Redeemed by</Txt>
                </TableHead>
                <TableHead>
                  <Txt>Honoured by</Txt>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(log.data?.vouchers ?? []).map(item => (
                <TableRow key={item.id}>
                  <TableCell className="font-mono font-bold">{item.code}</TableCell>
                  <TableCell className={`${cell} min-w-36`}>
                    {item.reward}
                    <span className="block text-[13px] text-muted-foreground">
                      {item.barangay} · {item.points_cost} <Txt>pts</Txt>
                    </span>
                  </TableCell>
                  <TableCell>
                    <Txt>{STATUS[item.status] ?? item.status}</Txt>
                  </TableCell>
                  <TableCell className={`${cell} min-w-36`}>
                    {who(item.redeemed_by)}
                    <span className="block text-[13px] text-muted-foreground">
                      <DateText value={item.redeemed_at} />
                    </span>
                  </TableCell>
                  <TableCell className={`${cell} min-w-36`}>
                    {who(item.honoured_by)}
                    {item.honoured_at && (
                      <span className="block text-[13px] text-muted-foreground">
                        <DateText value={item.honoured_at} />
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
      <div className="space-y-2">
        <h3 className="label-caps text-[12px] text-muted-foreground">
          <Txt>Price and stock changes</Txt>
        </h3>
        {log.data?.reward_changes.length === 0 ? (
          <p className="text-[14px] text-muted-foreground">
            <Txt>No changes yet.</Txt>
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <Txt>Reward</Txt>
                </TableHead>
                <TableHead>
                  <Txt>Who and when</Txt>
                </TableHead>
                <TableHead>
                  <Txt>What</Txt>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(log.data?.reward_changes ?? []).map(item => (
                <TableRow key={item.id}>
                  <TableCell className={`${cell} min-w-36`}>
                    {item.reward}
                    <span className="block text-[13px] text-muted-foreground">{item.barangay}</span>
                  </TableCell>
                  <TableCell className={`${cell} min-w-36`}>
                    {who(item.actor_id)}
                    <span className="block text-[13px] text-muted-foreground">
                      <DateText value={item.created_at} />
                    </span>
                  </TableCell>
                  <TableCell className={`${cell} min-w-44`}>
                    <span className="font-bold">
                      <Txt>{item.action === 'created' ? 'Added' : 'Changed'}</Txt>
                    </span>
                    <ChangeText item={item} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </section>
  )
}
