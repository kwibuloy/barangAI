import { useState } from 'react'
import { Gift, Ticket } from 'lucide-react'
import { Alert, EmptyState, LargeTitle, PageSpinner, Segmented } from '@/components/page'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Txt, useText } from '../../lib/i18n'
import { ResidentAccount } from '../../app/ResidentShell'
import { usePoints, useRedeem, useShop, useShopBarangays, useVouchers, type PointEntry, type Reward } from './queries'

const ENTRY: Record<PointEntry['kind'], string> = {
  accepted: 'Report accepted',
  resolved: 'Report resolved',
  first_reporter: 'First to report',
  redeem: 'Reward redeemed',
  refund: 'Unused code refunded',
  reversal: 'Report removed',
  merge: 'Grouped reports settled',
}
const when = (value: string) => new Date(value).toLocaleDateString(undefined, { dateStyle: 'medium' })

function RewardCard({ reward, balance }: { reward: Reward; balance: number }) {
  const redeem = useRedeem()
  const [asking, setAsking] = useState(false)
  const short = balance < reward.points_cost
  const gone = reward.stock === 0
  return (
    <li className="edge space-y-3 rounded-2xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <strong className="block text-[16px] font-extrabold">{reward.name}</strong>
          {reward.partner && <span className="block text-[13px] text-muted-foreground">{reward.partner}</span>}
          {reward.description && <span className="block text-[13px] text-muted-foreground">{reward.description}</span>}
          {reward.stock !== null && (
            <span className="block text-[13px] text-muted-foreground">
              {reward.stock} <Txt>left</Txt>
            </span>
          )}
        </div>
        <span className="shrink-0 rounded-xl border-2 border-[#ffc800] bg-[#fff4c2] px-2.5 py-1 text-[14px] font-extrabold text-[#7a5a00] tabular-nums dark:bg-[#ffc800]/15 dark:text-[#ffd84d]">
          {reward.points_cost} <Txt>pts</Txt>
        </span>
      </div>
      {asking ? (
        <div className="flex flex-wrap gap-2 *:grow *:basis-auto">
          <Button
            disabled={redeem.isPending}
            onClick={() => redeem.mutate(reward.id, { onSettled: () => setAsking(false) })}
          >
            <Txt>Spend the points</Txt>
          </Button>
          <Button variant="outline" onClick={() => setAsking(false)}>
            <Txt>Cancel</Txt>
          </Button>
        </div>
      ) : (
        <Button className="w-full" variant="outline" disabled={short || gone} onClick={() => setAsking(true)}>
          <Txt>{gone ? 'Out of stock' : short ? 'Not enough points' : 'Redeem'}</Txt>
        </Button>
      )}
      {redeem.error && (
        <Alert>
          <Txt>{redeem.error.message}</Txt>
        </Alert>
      )}
    </li>
  )
}

function Shop({ balance }: { balance: number }) {
  const t = useText()
  const barangays = useShopBarangays()
  const [barangay, setBarangay] = useState('')
  const shop = useShop(barangay)
  return (
    <div className="space-y-3">
      <label className="block space-y-1.5 text-[14px] font-bold">
        <Txt>Choose a barangay</Txt>
        <Select value={barangay} onChange={event => setBarangay(event.target.value)}>
          <option value="">{t('Choose a barangay')}</option>
          {(barangays.data ?? []).map(item => (
            <option key={item.id} value={item.id}>
              {item.name}
            </option>
          ))}
        </Select>
      </label>
      {barangay && shop.isLoading && <PageSpinner />}
      {barangay && shop.data?.length === 0 && (
        <EmptyState
          icon={<Gift className="size-8" aria-hidden="true" />}
          title={t('No rewards here yet')}
          body={t('Try another barangay.')}
        />
      )}
      <ul className="space-y-3">
        {(shop.data ?? []).map(reward => (
          <RewardCard key={reward.id} reward={reward} balance={balance} />
        ))}
      </ul>
    </div>
  )
}

function Codes() {
  const t = useText()
  const vouchers = useVouchers()
  if (vouchers.isLoading) return <PageSpinner />
  const available = vouchers.data?.available ?? []
  return available.length === 0 ? (
    <EmptyState
      icon={<Ticket className="size-8" aria-hidden="true" />}
      title={t('No codes yet')}
      body={t('Redeem a reward in the shop to get a code.')}
    />
  ) : (
    <ul className="space-y-3">
      {available.map(item => (
        <li
          key={item.id}
          className="space-y-1 rounded-2xl border-2 border-dashed border-[#ffc800] bg-[#fffbe8] p-4 dark:bg-[#ffc800]/10"
        >
          <strong className="block text-[16px] font-extrabold">{item.reward}</strong>
          <span className="block text-[14px] text-muted-foreground">{item.barangay}</span>
          <code className="block py-1 font-mono text-[26px] font-extrabold tracking-[0.2em] break-all select-all">
            {item.code}
          </code>
          <span className="block text-[13px] text-muted-foreground">
            <Txt>Show this at the barangay. It works once. Expires</Txt> {when(item.expires_at)}
          </span>
        </li>
      ))}
    </ul>
  )
}

function History({ entries }: { entries: PointEntry[] }) {
  const vouchers = useVouchers()
  const past = vouchers.data?.history ?? []
  return (
    <div className="space-y-4">
      {past.length > 0 && (
        <ul className="edge divide-y-2 overflow-hidden rounded-2xl">
          {past.map(item => (
            <li key={item.id} className="flex items-center justify-between gap-3 p-3.5 text-[15px]">
              <span className="min-w-0">
                <span className="block font-extrabold">{item.reward}</span>
                <span className="block text-[13px] text-muted-foreground">
                  {item.code} · {item.barangay}
                </span>
              </span>
              <span className="shrink-0 text-[13px] font-medium text-muted-foreground">
                <Txt>{item.status === 'used' ? 'Used' : 'Expired'}</Txt>
              </span>
            </li>
          ))}
        </ul>
      )}
      <ul className="edge divide-y-2 overflow-hidden rounded-2xl">
        {entries.length === 0 && (
          <li className="p-3.5 text-[15px] text-muted-foreground">
            <Txt>Points appear here once staff accept your report.</Txt>
          </li>
        )}
        {entries.map(item => (
          <li key={item.id} className="flex items-center justify-between gap-3 p-3.5 text-[15px]">
            <span className="min-w-0">
              <span className="block font-extrabold">
                <Txt>{ENTRY[item.kind]}</Txt>
              </span>
              <span className="block text-[13px] text-muted-foreground">{when(item.created_at)}</span>
            </span>
            <span
              className={`shrink-0 font-extrabold tabular-nums ${item.amount > 0 ? 'text-leaf-ink' : 'text-muted-foreground'}`}
            >
              {item.amount > 0 ? '+' : ''}
              {item.amount}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Basic version: points, each barangay's shop, the resident's codes, and their history. */
export function RewardsPage() {
  const t = useText()
  const points = usePoints()
  const [section, setSection] = useState<'shop' | 'codes' | 'history'>('shop')
  return (
    <div className="space-y-4 lg:mx-auto lg:max-w-3xl">
      <LargeTitle
        title={t('Rewards')}
        subtitle={<Txt>Earn points for valid reports and spend them in any barangay's shop.</Txt>}
        trailing={<ResidentAccount />}
      />
      <div className="flex items-center gap-4 rounded-2xl border-2 border-b-4 border-[#ffd84d] bg-[#fff7d6] p-4 dark:border-[#7a6200] dark:bg-[#ffc800]/10">
        <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-[#ffc800] text-[#4a3a00] shadow-[0_4px_0_#e0a800]">
          <Gift className="size-7" strokeWidth={2.5} aria-hidden="true" />
        </span>
        <span className="min-w-0">
          <span className="label-caps block text-[12px] text-[#7a5a00] dark:text-[#ffd84d]">
            <Txt>Your points</Txt>
          </span>
          <strong className="display block text-[36px] leading-tight tabular-nums">{points.data?.balance ?? 0}</strong>
        </span>
      </div>
      {(points.data?.owed ?? 0) > 0 && (
        <p className="px-1 text-[14px] text-muted-foreground">
          {t(
            '{n} points to settle: they were already spent when a report was removed or grouped. They come out of your next refund.',
          ).replace('{n}', String(points.data?.owed))}
        </p>
      )}
      <Segmented
        id="rewards-section"
        label={t('Rewards')}
        value={section}
        onChange={setSection}
        options={[
          { value: 'shop', label: t('Shop') },
          { value: 'codes', label: t('My codes') },
          { value: 'history', label: t('History') },
        ]}
      />
      {section === 'shop' && <Shop balance={points.data?.balance ?? 0} />}
      {section === 'codes' && <Codes />}
      {section === 'history' && <History entries={points.data?.history ?? []} />}
    </div>
  )
}
