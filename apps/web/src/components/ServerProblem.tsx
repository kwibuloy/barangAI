import { LoaderCircle, RotateCw } from 'lucide-react'
import { Button } from './ui/button'
import { Kap } from './Kap'
import { NetworkError } from '../lib/api'
import { LanguageSwitch, Txt } from '../lib/i18n'

/** The app can't tell who is signed in because the server didn't answer. That isn't being signed out, so no sign-in. */
export function ServerProblem({
  error,
  retrying,
  onRetry,
}: {
  error: Error | null
  retrying: boolean
  onRetry: () => void
}) {
  const unreachable = error instanceof NetworkError
  return (
    <main className="pt-safe grid min-h-dvh place-items-center bg-background p-4">
      <div className="flex w-full max-w-sm flex-col items-center text-center">
        <Kap pose="thinking" motion="pop" className="h-32 w-auto" />
        <h1 className="display mt-3 text-[26px]">
          <Txt>{unreachable ? "Can't reach your barangay's server" : "Your barangay's server has a problem"}</Txt>
        </h1>
        <p className="mt-2 text-[15px] text-muted-foreground">
          <Txt>
            {unreachable
              ? 'Check that you are on the same Wi-Fi as your barangay hall, then try again.'
              : 'This is not your fault. Try again in a moment.'}
          </Txt>
        </p>
        <Button size="lg" className="mt-5 w-full" disabled={retrying} onClick={onRetry}>
          {retrying ? <LoaderCircle className="animate-spin motion-reduce:animate-none" /> : <RotateCw />}
          <Txt>Retry</Txt>
        </Button>
        <p className="mt-4 text-[13px] text-muted-foreground">
          <Txt>Not for emergencies. If anyone is in danger, call 911.</Txt>
        </p>
        <LanguageSwitch className="mt-2 text-link" />
      </div>
    </main>
  )
}
