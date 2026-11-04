import { Alert } from '@/components/page'
import { Button } from '@/components/ui/button'
import { Kap } from '@/components/Kap'
import { LanguageSwitch, Txt } from '../../lib/i18n'
import { useSignOut } from '../auth/queries'
import { ChangePasswordForm } from './AccountSecurity'

/** The only screen an account on a temporary password gets: an administrator has seen that password, so it can't stay. */
export function ForcedPasswordChange() {
  const signOut = useSignOut()
  return (
    <main className="grid min-h-dvh place-items-center bg-background p-4 pt-safe">
      <div className="w-full max-w-md space-y-4 py-6">
        <div className="flex items-center gap-3">
          <Kap pose="clipboard" motion="pop" className="h-24 w-auto shrink-0" />
          <div className="min-w-0">
            <h1 className="display text-[26px] leading-tight">
              <Txt>Choose your own password</Txt>
            </h1>
            <p className="mt-1 text-[15px] text-muted-foreground">
              <Txt>Your administrator gave you a temporary password. Change it first; the app opens right after.</Txt>
            </p>
          </div>
        </div>
        <section className="hairline rounded-2xl bg-card p-5">
          <ChangePasswordForm currentLabel="Temporary password" />
        </section>
        {signOut.error && (
          <Alert>
            <Txt>{signOut.error.message}</Txt>
          </Alert>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <LanguageSwitch className="text-link" />
          <Button variant="ghost" size="sm" disabled={signOut.isPending} onClick={() => signOut.mutate()}>
            <Txt>Sign out</Txt>
          </Button>
        </div>
      </div>
    </main>
  )
}
