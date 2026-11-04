import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Check, Copy } from 'lucide-react'
import { Alert, PageSpinner } from '@/components/page'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Txt, useText } from '../../lib/i18n'
import { useMe } from '../auth/queries'
import {
  useAddStaff,
  useAdminBarangays,
  useChangeStaff,
  useResetStaffPassword,
  useServerAddress,
  useStaffAccounts,
  type StaffAccount,
} from './queries'

/** Browsers refuse the clipboard API on plain HTTP, which is how a laptop on the Wi-Fi is reached. */
async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    const area = document.createElement('textarea')
    area.value = text
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.append(area)
    area.select()
    try {
      return document.execCommand('copy')
    } catch {
      return false
    } finally {
      area.remove()
    }
  }
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const t = useText()
  const [state, setState] = useState<'idle' | 'done' | 'failed'>('idle')
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        aria-label={`${t('Copy')}: ${t(label)}`}
        onClick={() => void copyText(text).then(copied => setState(copied ? 'done' : 'failed'))}
      >
        {state === 'done' ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
        <Txt>{state === 'done' ? 'Copied' : 'Copy'}</Txt>
      </Button>
      <span role="status" className="text-[13px] text-muted-foreground">
        {state === 'failed' && <Txt>Couldn't copy. Select the text and copy it yourself.</Txt>}
      </span>
    </div>
  )
}

type Issued = { email: string; password: string }

/** A temporary password appears once, here, and nowhere else: it isn't stored in a readable form. */
function OneTimePassword({ issued, onDone }: { issued: Issued; onDone: () => void }) {
  const panel = useRef<HTMLDivElement>(null)
  // Reset from further down the page: bring the person to the one thing they mustn't miss.
  useEffect(() => panel.current?.focus(), [issued])
  return (
    <section
      ref={panel}
      tabIndex={-1}
      aria-labelledby="one-time-password"
      className="edge space-y-3 rounded-2xl p-4 outline-none"
    >
      {/* Moving focus here says this heading aloud; not a live region, which would read the password to the room. */}
      <h2 id="one-time-password" className="text-[17px] font-extrabold">
        <Txt>Temporary password</Txt>
      </h2>
      <p className="text-[15px] break-words">
        <Txt>For</Txt> <strong className="font-extrabold">{issued.email}</strong>
      </p>
      <code className="hairline block rounded-xl bg-muted px-3 py-2.5 font-mono text-[20px] font-bold break-all select-all">
        {issued.password}
      </code>
      <p className="text-[15px] font-bold">
        <Txt>Give this in person. It is shown only once and can't be seen again.</Txt>
      </p>
      <p className="text-[14px] text-muted-foreground">
        <Txt>They must choose their own password when they first sign in. If it gets lost, reset it again.</Txt>
      </p>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <CopyButton text={issued.password} label="Temporary password" />
        <Button type="button" size="sm" onClick={onDone}>
          <Txt>I've given it</Txt>
        </Button>
      </div>
    </section>
  )
}

function AddAccount({ onIssued, barangays }: { onIssued: (issued: Issued) => void; barangays: string[] }) {
  const t = useText()
  const add = useAddStaff()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<StaffAccount['role']>('staff')
  const [barangay, setBarangay] = useState('')
  const staff = role === 'staff'
  function submit(event: FormEvent) {
    event.preventDefault()
    add.mutate(
      { email: email.trim(), role, ...(staff && barangay ? { barangay } : {}) },
      {
        onSuccess: account => {
          onIssued({ email: account.email, password: account.temporary_password })
          setEmail('')
          setBarangay('')
        },
      },
    )
  }
  const needsBarangay = staff && barangays.length > 0 && !barangay
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>
          <Txt>Add an account</Txt>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-2.5">
          <Input
            type="email"
            required
            aria-label={t('Email')}
            placeholder={t('Email')}
            autoComplete="off"
            maxLength={320}
            value={email}
            onChange={event => setEmail(event.target.value)}
          />
          <div className="grid gap-2.5 sm:grid-cols-2">
            <Select
              aria-label={t('Role')}
              value={role}
              onChange={event => setRole(event.target.value as StaffAccount['role'])}
            >
              <option value="staff">{t('Staff')}</option>
              <option value="administrator">{t('Administrator')}</option>
            </Select>
            {staff && barangays.length > 0 && (
              <Select
                aria-label={t('Barangay')}
                required
                value={barangay}
                onChange={event => setBarangay(event.target.value)}
              >
                <option value="">{t('Choose a barangay')}</option>
                {barangays.map(name => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </Select>
            )}
          </div>
          <Button type="submit" className="w-full" disabled={add.isPending || !email.trim() || needsBarangay}>
            <Txt>Add account</Txt>
          </Button>
          {add.error && (
            <Alert>
              <Txt>{add.error.message}</Txt>
            </Alert>
          )}
        </form>
      </CardContent>
    </Card>
  )
}

// Rows become stacks on phones (one set of controls, no sideways scrolling).
const stackRow = 'max-md:block max-md:px-3 max-md:py-3'
const stackCell = 'whitespace-normal max-md:block max-md:px-0 max-md:py-1'

function AccountRow({
  account,
  self,
  barangays,
  onIssued,
  onSaved,
}: {
  account: StaffAccount
  self: boolean
  barangays: string[]
  onIssued: (issued: Issued) => void
  onSaved: (message: string) => void
}) {
  const t = useText()
  const change = useChangeStaff()
  const reset = useResetStaffPassword()
  const [asking, setAsking] = useState<'disable' | 'reset' | null>(null)
  const busy = change.isPending || reset.isPending
  const error = change.error ?? reset.error
  const saved = (text: string) => onSaved(`${account.email}: ${t(text)}`)
  return (
    <TableRow className={stackRow}>
      <TableCell className={stackCell}>
        <strong className="block font-extrabold break-all">{account.email}</strong>
        {self && (
          <span className="text-[13px] text-muted-foreground">
            <Txt>This is you</Txt>
          </span>
        )}
        {account.must_change_password && (
          <span className="block text-[13px] text-muted-foreground">
            <Txt>Still on a temporary password</Txt>
          </span>
        )}
      </TableCell>
      <TableCell className={stackCell}>
        <Txt>{account.role === 'administrator' ? 'Administrator' : 'Staff'}</Txt>
      </TableCell>
      <TableCell className={`${stackCell} min-w-44`}>
        {account.role === 'administrator' ? (
          <span className="text-muted-foreground">
            <Txt>All barangays</Txt>
          </span>
        ) : barangays.length > 0 ? (
          <Select
            aria-label={`${t('Barangay')}: ${account.email}`}
            value={account.barangay ?? ''}
            disabled={busy}
            onChange={event =>
              event.target.value &&
              change.mutate(
                { id: account.id, barangay: event.target.value },
                { onSuccess: () => saved('Barangay saved.') },
              )
            }
          >
            {!account.barangay && <option value="">{t('Choose a barangay')}</option>}
            {barangays.map(name => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </Select>
        ) : (
          <span className="text-muted-foreground">
            <Txt>No barangays loaded</Txt>
          </span>
        )}
      </TableCell>
      <TableCell className={stackCell}>
        <span className={account.disabled ? 'font-bold text-destructive' : ''}>
          <Txt>{account.disabled ? 'Disabled' : 'Active'}</Txt>
        </span>
      </TableCell>
      <TableCell className={stackCell}>
        {asking ? (
          <div role="group" aria-label={t('Confirm')} className="max-w-xs space-y-2">
            <p className="text-[14px]">
              <Txt>
                {asking === 'disable'
                  ? "They are signed out right away and can't sign in until enabled."
                  : 'They are signed out and the old password stops working.'}
              </Txt>
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={asking === 'disable' ? 'destructive' : 'default'}
                disabled={busy}
                onClick={() => {
                  if (asking === 'disable')
                    change.mutate(
                      { id: account.id, disabled: true },
                      { onSuccess: () => saved('Account disabled.'), onSettled: () => setAsking(null) },
                    )
                  else
                    reset.mutate(account.id, {
                      onSuccess: result => onIssued({ email: account.email, password: result.temporary_password }),
                      onSettled: () => setAsking(null),
                    })
                }}
              >
                <Txt>{asking === 'disable' ? 'Yes, disable' : 'Yes, reset'}</Txt>
              </Button>
              <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => setAsking(null)}>
                <Txt>Cancel</Txt>
              </Button>
            </div>
          </div>
        ) : (
          !self && (
            <div className="flex flex-wrap gap-2">
              {account.disabled ? (
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  disabled={busy}
                  aria-label={`${t('Enable')}: ${account.email}`}
                  onClick={() =>
                    change.mutate({ id: account.id, disabled: false }, { onSuccess: () => saved('Account enabled.') })
                  }
                >
                  <Txt>Enable</Txt>
                </Button>
              ) : (
                <>
                  <Button
                    type="button"
                    size="xs"
                    variant="outline"
                    disabled={busy}
                    aria-label={`${t('Reset password')}: ${account.email}`}
                    onClick={() => setAsking('reset')}
                  >
                    <Txt>Reset password</Txt>
                  </Button>
                  <Button
                    type="button"
                    size="xs"
                    variant="secondary"
                    disabled={busy}
                    aria-label={`${t('Disable')}: ${account.email}`}
                    onClick={() => setAsking('disable')}
                  >
                    <Txt>Disable</Txt>
                  </Button>
                </>
              )}
            </div>
          )
        )}
        {error && (
          <Alert className="mt-2">
            <Txt>{error.message}</Txt>
          </Alert>
        )}
      </TableCell>
    </TableRow>
  )
}

/** Where residents' phones reach this computer. Text for now: a QR code needs a dependency the project doesn't have. */
export function PhoneAddress() {
  const address = useServerAddress()
  const addresses = address.data?.addresses ?? []
  const main = addresses.find(item => item.listening) ?? addresses[0]
  if (address.isError) return null
  if (!address.data) return <div className="shimmer h-10 rounded-xl" />
  if (!main)
    return (
      <p className="text-[14px] text-muted-foreground">
        <Txt>No Wi-Fi address found. Connect this computer to the Wi-Fi, then reload this page.</Txt>
      </p>
    )
  return (
    <div className="space-y-2">
      <code className="hairline block rounded-xl bg-muted px-3 py-2.5 font-mono text-[17px] font-bold break-all select-all">
        {main.url}
      </code>
      <CopyButton text={main.url} label="Phone address" />
      {!main.listening && (
        <Alert>
          <Txt>Phones can't reach this yet. Restart BarangAI with:</Txt>{' '}
          <code className="font-mono break-all">deploy/start-local.ps1&nbsp;-Lan</code>
        </Alert>
      )}
      {addresses.length > 1 && (
        <p className="text-[13px] break-all text-muted-foreground">
          <Txt>If that doesn't work, try:</Txt>{' '}
          {addresses
            .filter(item => item !== main)
            .map(item => item.url)
            .join(', ')}
        </p>
      )}
    </div>
  )
}

/** Administrators start a barangay here without a terminal. The API enforces all of this; hiding the page is courtesy. */
export function AccountsPage() {
  const t = useText()
  const me = useMe().data
  const accounts = useStaffAccounts()
  const barangays = useAdminBarangays()
  const [issued, setIssued] = useState<Issued | null>(null)
  const [saved, setSaved] = useState('')
  const names = (barangays.data ?? []).map(item => item.name)
  return (
    <div className="mx-auto max-w-5xl space-y-4 p-5 md:p-8">
      <h1 className="display text-[30px] leading-tight">
        <Txt>Staff accounts</Txt>
      </h1>
      {issued && <OneTimePassword issued={issued} onDone={() => setIssued(null)} />}
      <AddAccount onIssued={setIssued} barangays={names} />
      <Card size="sm">
        <CardHeader>
          <CardTitle>
            <Txt>Who can use the desk</Txt>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p role="status" className="text-[14px] font-medium text-[var(--status-resolved)]">
            {saved}
          </p>
          {accounts.isPending && <PageSpinner />}
          {accounts.error && (
            <Alert>
              <Txt>{accounts.error.message}</Txt>
            </Alert>
          )}
          {accounts.data && (
            <Table className="max-md:block">
              <TableHeader className="max-md:hidden">
                <TableRow>
                  <TableHead>
                    <Txt>Email</Txt>
                  </TableHead>
                  <TableHead>
                    <Txt>Role</Txt>
                  </TableHead>
                  <TableHead>
                    <Txt>Barangay</Txt>
                  </TableHead>
                  <TableHead>
                    <Txt>Status</Txt>
                  </TableHead>
                  <TableHead>
                    <Txt>Actions</Txt>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="max-md:block">
                {accounts.data.map(account => (
                  <AccountRow
                    key={account.id}
                    account={account}
                    self={account.id === me?.id}
                    barangays={names}
                    onIssued={setIssued}
                    onSaved={setSaved}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <Card size="sm">
        <CardHeader>
          <CardTitle>
            <Txt>Set up a resident's phone</Txt>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <p className="text-[15px]">
            {t('Open the BarangAI app and enter this address. The phone must be on the same Wi-Fi.')}
          </p>
          <PhoneAddress />
        </CardContent>
      </Card>
    </div>
  )
}
