import { useState, type FormEvent } from 'react'
import { Alert } from '@/components/page'
import { RewardsLog } from './RewardsLog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Txt, useText } from '../../lib/i18n'
import { useMe } from '../auth/queries'
import {
  useCreateReward,
  useManagedRewards,
  useSetRewardActive,
  useShopBarangays,
  useUseVoucher,
} from '../rewards/queries'

function UseCode() {
  const t = useText()
  const [code, setCode] = useState('')
  const use = useUseVoucher()
  function submit(event: FormEvent) {
    event.preventDefault()
    if (code.trim()) use.mutate(code.trim(), { onSuccess: () => setCode('') })
  }
  return (
    <section className="edge space-y-3 rounded-2xl p-4">
      <h2 className="text-[17px] font-extrabold">
        <Txt>Use a resident's code</Txt>
      </h2>
      <form onSubmit={submit} className="flex flex-wrap gap-2">
        <Input
          aria-label={t('Code')}
          value={code}
          onChange={event => setCode(event.target.value)}
          placeholder={t('Code')}
          className="min-w-40 flex-1 uppercase"
        />
        <Button type="submit" className="grow basis-auto" disabled={use.isPending || !code.trim()}>
          <Txt>Mark as used</Txt>
        </Button>
      </form>
      {use.data && !use.isPending && (
        <p role="status" className="text-[15px]">
          <strong>{use.data.reward}</strong> · <Txt>Marked as used. Give the resident their reward.</Txt>
        </p>
      )}
      {use.error && (
        <Alert>
          <Txt>{use.error.message}</Txt>
        </Alert>
      )}
    </section>
  )
}

function AddReward() {
  const t = useText()
  const administrator = useMe().data?.role === 'administrator'
  const barangays = useShopBarangays()
  const create = useCreateReward()
  const [name, setName] = useState('')
  const [cost, setCost] = useState('')
  const [stock, setStock] = useState('')
  const [partner, setPartner] = useState('')
  const [barangay, setBarangay] = useState('')
  function submit(event: FormEvent) {
    event.preventDefault()
    create.mutate(
      {
        name,
        points_cost: Number(cost),
        stock: stock ? Number(stock) : null,
        partner,
        ...(administrator ? { barangay_id: barangay } : {}),
      },
      {
        onSuccess: () => {
          setName('')
          setCost('')
          setStock('')
          setPartner('')
        },
      },
    )
  }
  return (
    <section className="edge space-y-3 rounded-2xl p-4">
      <h2 className="text-[17px] font-extrabold">
        <Txt>Add a reward</Txt>
      </h2>
      <p className="text-[14px] text-muted-foreground">
        <Txt>5 points = ₱1. A ₱50 certificate costs 250 points.</Txt>
      </p>
      <form onSubmit={submit} className="space-y-2.5">
        {administrator && (
          <Select
            aria-label={t('Barangay')}
            required
            value={barangay}
            onChange={event => setBarangay(event.target.value)}
          >
            <option value="">{t('Choose a barangay')}</option>
            {(barangays.data ?? []).map(item => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
        )}
        <Input
          aria-label={t('Reward name')}
          placeholder={t('Reward name')}
          required
          maxLength={120}
          value={name}
          onChange={event => setName(event.target.value)}
        />
        <Input
          aria-label={t('Partner (optional)')}
          placeholder={t('Partner (optional)')}
          maxLength={120}
          value={partner}
          onChange={event => setPartner(event.target.value)}
        />
        {/* Side by side from tablets up; stacked on phones so "Stock (optional)" isn't cut off. */}
        <div className="grid gap-2.5 sm:grid-cols-2">
          <Input
            aria-label={t('Points')}
            placeholder={t('Points')}
            type="number"
            required
            min={1}
            value={cost}
            onChange={event => setCost(event.target.value)}
          />
          <Input
            aria-label={t('Stock (optional)')}
            placeholder={t('Stock (optional)')}
            type="number"
            min={0}
            value={stock}
            onChange={event => setStock(event.target.value)}
          />
        </div>
        <Button type="submit" className="w-full" disabled={create.isPending}>
          <Txt>Add reward</Txt>
        </Button>
      </form>
      {create.error && (
        <Alert>
          <Txt>{create.error.message}</Txt>
        </Alert>
      )}
    </section>
  )
}

function RewardList() {
  const t = useText()
  const administrator = useMe().data?.role === 'administrator'
  const barangays = useShopBarangays()
  const [barangay, setBarangay] = useState('')
  const rewards = useManagedRewards(barangay)
  const toggle = useSetRewardActive()
  return (
    <section className="edge overflow-hidden rounded-2xl">
      <h2 className="p-4 pb-2 text-[17px] font-extrabold">
        <Txt>Rewards in the shop</Txt>
      </h2>
      {administrator && (
        <div className="px-4 pb-2">
          <Select
            aria-label={t('Filter by barangay')}
            value={barangay}
            onChange={event => setBarangay(event.target.value)}
          >
            <option value="">{t('All barangays')}</option>
            {(barangays.data ?? []).map(item => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
        </div>
      )}
      <ul className="divide-y-2">
        {(rewards.data ?? []).map(reward => (
          <li key={reward.id} className="flex items-center justify-between gap-3 px-4 py-3 text-[15px]">
            <span className="min-w-0">
              <span className="block font-extrabold">{reward.name}</span>
              <span className="block text-[13px] text-muted-foreground">
                {administrator && reward.barangay && `${reward.barangay} · `}
                {reward.points_cost} <Txt>pts</Txt>
                {reward.stock !== null && (
                  <>
                    {' · '}
                    {reward.stock} <Txt>left</Txt>
                  </>
                )}
              </span>
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={toggle.isPending}
              onClick={() => toggle.mutate({ id: reward.id, active: !reward.active })}
            >
              <Txt>{reward.active ? 'Hide' : 'Show'}</Txt>
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Basic version: staff use residents' codes and manage their barangay's shop; administrators, every barangay's. */
export function RewardsDeskPage() {
  const administrator = useMe().data?.role === 'administrator'
  return (
    <div className="mx-auto max-w-3xl space-y-4 p-5 md:p-8">
      <h1 className="display text-[30px] leading-tight">
        <Txt>Rewards</Txt>
      </h1>
      <UseCode />
      <AddReward />
      <RewardList />
      {administrator && <RewardsLog />}
    </div>
  )
}
