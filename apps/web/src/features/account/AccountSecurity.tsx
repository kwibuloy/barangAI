import { useState, type FormEvent, type ReactNode } from 'react'
import { LoaderCircle } from 'lucide-react'
import { Alert } from '@/components/page'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Txt } from '../../lib/i18n'
import { useChangePassword, useDeleteAccount, type User } from '../auth/queries'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[14px] font-medium">
        <Txt>{label}</Txt>
      </span>
      {children}
    </label>
  )
}

function Fold({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="hairline rounded-xl bg-card">
      <summary className="flex min-h-11 cursor-pointer items-center px-3 text-[15px] font-medium">
        <Txt>{title}</Txt>
      </summary>
      <div className="space-y-3 px-3 pb-3">{children}</div>
    </details>
  )
}

/** Also the whole of the screen an account with a temporary password sees, which names the current one differently. */
export function ChangePasswordForm({ currentLabel = 'Current password' }: { currentLabel?: string }) {
  const change = useChangePassword()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  function submit(event: FormEvent) {
    event.preventDefault()
    change.mutate(
      { current_password: current, new_password: next },
      {
        onSuccess: () => {
          setCurrent('')
          setNext('')
        },
      },
    )
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label={currentLabel}>
        <Input
          type="password"
          required
          autoComplete="current-password"
          value={current}
          onChange={event => setCurrent(event.target.value)}
        />
      </Field>
      <Field label="New password">
        <Input
          type="password"
          required
          minLength={12}
          maxLength={128}
          autoComplete="new-password"
          value={next}
          onChange={event => setNext(event.target.value)}
        />
      </Field>
      <p className="text-[13px] text-muted-foreground">
        <Txt>Use at least 12 characters. Your other devices will be signed out.</Txt>
      </p>
      {change.error && (
        <Alert>
          <Txt>{change.error.message}</Txt>
        </Alert>
      )}
      {change.isSuccess && (
        <p role="status" className="text-[14px] font-medium text-[var(--status-resolved)]">
          <Txt>Password changed.</Txt>
        </p>
      )}
      <Button type="submit" className="w-full" disabled={change.isPending}>
        {change.isPending && <LoaderCircle className="animate-spin" />}
        <Txt>Change password</Txt>
      </Button>
    </form>
  )
}

function ChangePassword() {
  return (
    <Fold title="Change password">
      <ChangePasswordForm />
    </Fold>
  )
}

function DeleteAccount({ user }: { user: User }) {
  const remove = useDeleteAccount()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  function submit(event: FormEvent) {
    event.preventDefault()
    remove.mutate({ email, ...(user.google ? {} : { password }) })
  }
  return (
    <Fold title="Delete my account">
      <form onSubmit={submit} className="space-y-3">
        <p className="text-[14px]">
          <Txt>
            This permanently deletes your account and all your reports and photos, including reports staff are still
            working on. It cannot be undone.
          </Txt>
        </p>
        <Field label="Type your email address to confirm">
          <Input
            type="email"
            required
            autoComplete="off"
            value={email}
            onChange={event => setEmail(event.target.value)}
          />
        </Field>
        {!user.google && (
          <Field label="Current password">
            <Input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={event => setPassword(event.target.value)}
            />
          </Field>
        )}
        {remove.error && (
          <Alert>
            <Txt>{remove.error.message}</Txt>
          </Alert>
        )}
        <Button
          type="submit"
          variant="destructive"
          className="w-full"
          disabled={remove.isPending || email.trim().toLowerCase() !== user.email}
        >
          {remove.isPending && <LoaderCircle className="animate-spin" />}
          <Txt>Delete my account</Txt>
        </Button>
      </form>
    </Fold>
  )
}

/** Password and account removal, folded away inside settings. Staff accounts are managed by the operator. */
export function AccountSecurity({ user }: { user: User }) {
  return (
    <div className="space-y-2">
      {!user.google && <ChangePassword />}
      {user.role === 'resident' && <DeleteAccount user={user} />}
    </div>
  )
}
