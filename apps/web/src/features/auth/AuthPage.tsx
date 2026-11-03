import { useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router'
import { AnimatePresence, m } from 'motion/react'
import { Camera, Eye, EyeOff, LoaderCircle, MapPin, ShieldCheck } from 'lucide-react'
import { Wordmark } from '@/components/BrandMark'
import { Kap, kapAvailable } from '@/components/Kap'
import { Alert } from '@/components/page'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LanguageSwitch, Txt, useText } from '../../lib/i18n'
import { useGoogleConfig, useSignIn } from './queries'

const GOOGLE_ERRORS: Record<string, string> = {
  google_cancelled: 'Google sign-in was cancelled. Try again or use your password.',
  google_invalid_state: 'Google sign-in expired. Please try again.',
  google_failed: 'Google sign-in is unavailable right now. Try again or use your password.',
  google_email_unverified: 'Use a verified Google email address to sign in.',
  google_account_exists: 'This email already has an account. Sign in with your password.',
  google_resident_only: 'Google sign-in is available for resident accounts only.',
}

const POINTS = [
  { icon: Camera, text: 'Photo guided reports' },
  { icon: MapPin, text: 'Precise locations' },
  { icon: ShieldCheck, text: 'Reviewed by barangay personnel' },
]

/** Kap waves hello (his own pose from the artwork), with a speech bubble that pops in after. */
function Greeter({ className }: { className?: string }) {
  const pose = kapAvailable('wave') ? 'wave' : 'thumbs'
  return (
    <div className={className}>
      <div className="relative mx-auto w-fit">
        <div
          aria-hidden="true"
          className="absolute inset-x-[-15%] bottom-0 h-1/2 rounded-full bg-white/25 blur-3xl dark:bg-white/10"
        />
        <Kap pose={pose} motion="greet" className="relative h-56 w-auto sm:h-64 lg:h-[min(24rem,44vh)]" />
        <m.span
          initial={{ opacity: 0, scale: 0.6, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ delay: 0.5, type: 'spring', stiffness: 420, damping: 22 }}
          className="absolute top-4 -right-4 origin-bottom-left rounded-2xl rounded-bl-sm bg-white px-3 py-1.5 text-[15px] font-semibold text-[#1d4fbf] shadow-lg sm:-right-10"
        >
          <Txt>Hi there!</Txt>
        </m.span>
      </div>
    </div>
  )
}

export function AuthPage() {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const t = useText()
  const [redirectError, setRedirectError] = useState('')
  const [params, setParams] = useSearchParams()
  const google = useGoogleConfig()
  const signIn = useSignIn()
  useEffect(() => {
    const code = params.get('auth_error')
    if (!code) return
    if (GOOGLE_ERRORS[code]) setRedirectError(GOOGLE_ERRORS[code])
    setParams({}, { replace: true })
  }, [params, setParams])
  function submit(event: FormEvent) {
    event.preventDefault()
    setRedirectError('')
    signIn.mutate({ mode, email, password })
  }
  const error = signIn.error?.message ?? redirectError
  return (
    <main className="min-h-dvh lg:grid lg:grid-cols-[minmax(0,1.1fr)_minmax(420px,0.9fr)]">
      <section className="pt-safe relative overflow-hidden bg-[linear-gradient(165deg,#4a8dff_0%,#1d64d8_48%,#173f9e_100%)] px-5 pb-0 text-white lg:flex lg:flex-col lg:px-14 lg:pb-14">
        <div className="flex h-14 items-center justify-between [&_.text-muted-foreground]:text-white/70">
          <Wordmark />
          <LanguageSwitch className="text-white/90 hover:bg-white/15" />
        </div>
        <div className="mx-auto max-w-xl pt-4 text-center lg:mx-0 lg:mt-[12vh] lg:max-w-[30rem] lg:pt-0 lg:text-left">
          <h1 className="text-[30px] leading-[1.1] font-bold sm:text-[38px] lg:text-[46px]">
            <Txt>See a concern in your community?</Txt>{' '}
            <span className="text-white/75">
              <Txt>Report it to your barangay.</Txt>
            </span>
          </h1>
          <p className="mx-auto mt-3 max-w-md text-[16px] text-white/85 lg:mx-0 lg:text-[18px]">
            <Txt>Share what you see, pin where it happened, and follow every report from submission to resolution.</Txt>
          </p>
          <ul className="mt-6 hidden gap-3 lg:grid">
            {POINTS.map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-center gap-3 text-[16px]">
                <span className="grid size-9 place-items-center rounded-[10px] bg-white/15">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <Txt>{text}</Txt>
              </li>
            ))}
          </ul>
        </div>
        <Greeter className="mt-4 lg:absolute lg:right-10 lg:bottom-0 lg:mt-0 xl:right-20" />
      </section>

      <section className="relative z-10 -mt-6 rounded-t-[28px] bg-background px-5 pt-7 pb-10 lg:mt-0 lg:flex lg:items-center lg:justify-center lg:rounded-none lg:px-12">
        <m.form
          onSubmit={submit}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto w-full max-w-sm space-y-4"
        >
          <AnimatePresence mode="wait" initial={false}>
            <m.div
              key={mode}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.16 }}
            >
              <h2 className="text-[28px] leading-tight font-bold">
                <Txt>{mode === 'login' ? 'Welcome back' : 'Create an account'}</Txt>
              </h2>
              <p className="mt-1 text-[15px] text-muted-foreground">
                <Txt>
                  {mode === 'login'
                    ? 'Sign in to track concerns in your community.'
                    : 'Join your barangay reporting channel.'}
                </Txt>
              </p>
            </m.div>
          </AnimatePresence>
          <label className="block space-y-1.5">
            <span className="text-[14px] font-medium">
              <Txt>Email address</Txt>
            </span>
            <Input
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              value={email}
              onChange={event => setEmail(event.target.value)}
            />
          </label>
          <div className="space-y-1.5">
            <label className="block space-y-1.5">
              <span className="text-[14px] font-medium">
                <Txt>Password</Txt>
              </span>
              <span className="relative block">
                <Input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={mode === 'register' ? 12 : undefined}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  aria-describedby={mode === 'register' ? 'password-hint' : undefined}
                  className="pr-12"
                />
                <button
                  type="button"
                  aria-label={t(showPassword ? 'Hide password' : 'Show password')}
                  aria-pressed={showPassword}
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute top-0 right-0 grid size-11 place-items-center text-muted-foreground"
                >
                  {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                </button>
              </span>
            </label>
            {mode === 'register' && (
              <small id="password-hint" className="block text-[13px] text-muted-foreground">
                <Txt>Use at least 12 characters.</Txt>
              </small>
            )}
          </div>
          {error && (
            <Alert>
              <Txt>{error}</Txt>
            </Alert>
          )}
          <Button size="lg" className="w-full" type="submit" disabled={signIn.isPending}>
            {signIn.isPending && <LoaderCircle className="animate-spin" />}
            <Txt>{signIn.isPending ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</Txt>
          </Button>
          {google.data?.enabled && (
            <>
              <div className="flex items-center gap-3 text-[13px] text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                <Txt>or</Txt>
                <span className="h-px flex-1 bg-border" />
              </div>
              <Button asChild variant="outline" size="lg" className="w-full bg-card">
                <a href="/api/auth/google/start">
                  <svg viewBox="0 0 24 24" className="size-5" aria-hidden="true">
                    <path
                      fill="#4285F4"
                      d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7Z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24Z"
                    />
                    <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1Z" />
                    <path
                      fill="#EA4335"
                      d="M12 4.8c1.8 0 3.4.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9Z"
                    />
                  </svg>
                  <Txt>Continue with Google</Txt>
                </a>
              </Button>
            </>
          )}
          <button
            type="button"
            className="mx-auto block min-h-11 px-2 text-[15px] font-medium text-primary"
            onClick={() => {
              setMode(mode === 'login' ? 'register' : 'login')
              signIn.reset()
              setRedirectError('')
            }}
          >
            <Txt>{mode === 'login' ? 'New here? Create an account' : 'Already registered? Sign in'}</Txt>
          </button>
        </m.form>
      </section>
    </main>
  )
}
