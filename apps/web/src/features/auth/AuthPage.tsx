import { Fragment, useCallback, useEffect, useRef, useState, type FormEvent, type PointerEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { useReducedMotion } from 'motion/react'
import { Eye, EyeOff, LoaderCircle } from 'lucide-react'
import { AuthKap } from './AuthKap'
import { Leaves } from './Leaves'
import './auth.css'
import { Wordmark } from '@/components/BrandMark'
import { cn } from '@/lib/utils'
import { Scene } from '@/components/Scene'
import { Alert } from '@/components/page'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LanguageSwitch, Txt, useText } from '../../lib/i18n'
import { LegalLinks } from '../legal/LegalPage'
import { useQueryClient } from '@tanstack/react-query'
import { isReturningVisitor, sessionEndedKey, useGoogleConfig, useSignIn } from './queries'

const GOOGLE_ERRORS: Record<string, string> = {
  google_cancelled: 'Google sign-in was cancelled. Try again or use your password.',
  google_invalid_state: 'Google sign-in expired. Please try again.',
  google_failed: 'Google sign-in is unavailable right now. Try again or use your password.',
  google_email_unverified: 'Use a verified Google email address to sign in.',
  google_account_exists: 'This email already has an account. Sign in with your password.',
  google_resident_only: 'Google sign-in is available for resident accounts only.',
}

// Kap introduces himself to someone new, one line at a time; a returning visitor just gets a welcome back.
const INTRO = ["Hi! I'm Kap", 'Your barangay helper.', "Spot a problem? I'll help you report it!"]
const REGISTER = ['Nice to meet you!', "Let's make your account."]

/** Types a line out letter by letter, each letter popping in (all at once under reduced motion). Every letter is laid
    out from the start and only fades in, so the bubble never jumps in size while typing; words stay unbroken. */
function Typed({ text }: { text: string }) {
  const reduced = useReducedMotion()
  const [count, setCount] = useState(0)
  useEffect(() => {
    setCount(reduced ? text.length : 0)
    if (reduced) return
    const timer = window.setInterval(
      () =>
        setCount(value => {
          if (value >= text.length) window.clearInterval(timer)
          return Math.min(text.length, value + 1)
        }),
      26,
    )
    return () => window.clearInterval(timer)
  }, [text, reduced])
  let start = 0
  const words = text.split(' ').map(word => {
    const at = start
    start += word.length + 1
    return { word, at }
  })
  return (
    <span className="auth-typed">
      {words.map(({ word, at }, w) => (
        <Fragment key={at}>
          {w > 0 && ' '}
          <span className="auth-word">
            {[...word].map((letter, i) => (
              <span key={i} className="auth-letter" data-on={at + i < count || undefined}>
                {letter}
              </span>
            ))}
          </span>
        </Fragment>
      ))}
    </span>
  )
}

/** Little round bubbles that float up off Kap's speech bubble and pop. */
function Fizz() {
  return (
    <span className="auth-fizz" aria-hidden="true">
      <i />
      <i />
      <i />
      <i />
    </span>
  )
}

/** What Kap says, following the form: introductions, a peek joke on the password, help when something fails. */
function useKapLine({
  mode,
  returning,
  emailFocus,
  privacyFocus,
  revealed,
  failed,
}: {
  mode: 'login' | 'register'
  returning: boolean
  emailFocus: boolean
  privacyFocus: boolean
  revealed: boolean
  failed: boolean
}) {
  const [step, setStep] = useState(0)
  const script = mode === 'register' ? REGISTER : returning ? ['Hello again! Welcome back!'] : INTRO
  useEffect(() => setStep(0), [mode])
  useEffect(() => {
    if (step >= script.length - 1) return
    const timer = window.setTimeout(() => setStep(value => value + 1), 2600)
    return () => clearTimeout(timer)
  }, [step, script.length])
  if (failed) return "Hmm, that didn't work. Check and try again?"
  if (revealed) return "Eyes covered! I can't see a thing."
  if (privacyFocus) return "I'm not peeking… promise!"
  if (emailFocus) return returning ? 'Is that you?' : "What's your email?"
  return script[Math.min(step, script.length - 1)]
}

export function AuthPage() {
  const [loadingStage, setLoadingStage] = useState(false)
  const previousFocus = useRef<HTMLElement | null>(null)
  const wasLoading = useRef(false)
  const loadingChanged = useCallback((active: boolean) => {
    if (active && !wasLoading.current && !previousFocus.current)
      previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    wasLoading.current = active
    setLoadingStage(active)
  }, [])
  useEffect(() => {
    if (loadingStage) return
    const target = previousFocus.current
    if (!target) return
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        if (target.isConnected && !target.closest('[inert]')) target.focus({ preventScroll: true })
        previousFocus.current = null
      })
    })
    return () => cancelAnimationFrame(frame)
  }, [loadingStage])
  const [returning] = useState(isReturningVisitor)
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [privacyFocus, setPrivacyFocus] = useState(false)
  const [emailFocus, setEmailFocus] = useState(false)
  const [agreed, setAgreed] = useState(false)
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
    const focused = document.activeElement
    const submitter = (event.nativeEvent as SubmitEvent).submitter
    previousFocus.current =
      focused instanceof HTMLElement && event.currentTarget.contains(focused)
        ? focused
        : submitter instanceof HTMLElement
          ? submitter
          : event.currentTarget.querySelector('button[type=submit]')
    setRedirectError('')
    signIn.mutate({ mode, email, password, ...(mode === 'register' ? { accepted_terms: agreed } : {}) })
  }
  const error = signIn.error?.message ?? redirectError
  const sessionEnded = Boolean(useQueryClient().getQueryData(sessionEndedKey))
  const line = useKapLine({ mode, returning, emailFocus, privacyFocus, revealed: showPassword, failed: Boolean(error) })
  // The hills drift with the pointer (desktop only); layers move by their data-depth (auth.css).
  function parallax(event: PointerEvent<HTMLElement>) {
    if (event.pointerType === 'touch') return
    const x = (event.clientX / innerWidth) * 2 - 1
    const y = (event.clientY / innerHeight) * 2 - 1
    event.currentTarget.style.setProperty('--px', (x * -14).toFixed(1))
    event.currentTarget.style.setProperty('--py', (y * -6).toFixed(1))
  }
  return (
    <main className="auth-scene" data-loading-stage={loadingStage} onPointerMove={parallax}>
      <Scene className="auth-hills" houses={false} />
      <Leaves />
      <div className="auth-ui" inert={loadingStage} aria-hidden={loadingStage || undefined}>
        <header className="auth-brand">
          <Wordmark size={48} textClassName="text-[32px]" />
          <LanguageSwitch className="auth-language" />
        </header>
        <div className="auth-composition">
          <div className="auth-greeter" aria-hidden="true">
            <AuthKap
              privacyFocus={privacyFocus}
              revealed={showPassword}
              pending={signIn.isPending}
              failed={Boolean(error)}
              onLoadingChange={loadingChanged}
            />
            <span className="auth-greeting" key={line}>
              <Typed text={t(line)} />
              <Fizz />
            </span>
          </div>
          <section className="auth-card" aria-labelledby="auth-heading">
            <form onSubmit={submit} className="auth-form" aria-busy={signIn.isPending}>
              <div className="auth-heading">
                <h1 id="auth-heading">
                  <Txt>{mode === 'login' ? (returning ? 'Welcome back' : 'Sign in') : 'Create an account'}</Txt>
                </h1>
                <p>
                  <Txt>
                    {mode === 'login'
                      ? 'Sign in to track concerns in your community.'
                      : 'Join your barangay reporting channel.'}
                  </Txt>
                </p>
              </div>
              <label className="block space-y-1.5">
                <span className="auth-label">
                  <Txt>Email address</Txt>
                </span>
                <Input
                  type="email"
                  required
                  autoComplete="email"
                  inputMode="email"
                  value={email}
                  onChange={event => setEmail(event.target.value)}
                  onFocus={() => setEmailFocus(true)}
                  onBlur={() => setEmailFocus(false)}
                />
              </label>
              <div
                className="space-y-1.5"
                data-password-area
                onFocusCapture={() => setPrivacyFocus(true)}
                onBlurCapture={event => {
                  if (!event.currentTarget.contains(event.relatedTarget)) setPrivacyFocus(false)
                }}
              >
                <label className="block space-y-1.5">
                  <span className="auth-label">
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
                      className="pr-14"
                    />
                    <button
                      type="button"
                      aria-label={t(showPassword ? 'Hide password' : 'Show password')}
                      aria-pressed={showPassword}
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute top-1/2 right-1.5 grid size-10 -translate-y-1/2 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-card hover:text-link"
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
              {mode === 'register' && (
                <label className="flex items-start gap-2.5 text-[14px]">
                  <input
                    type="checkbox"
                    required
                    checked={agreed}
                    onChange={event => setAgreed(event.target.checked)}
                    className="mt-0.5 size-5 shrink-0 accent-primary"
                  />
                  <span>
                    <Txt>I agree to the</Txt>{' '}
                    <Link to="/terms" className="font-medium text-link underline underline-offset-2">
                      <Txt>Terms and conditions</Txt>
                    </Link>{' '}
                    <Txt>and the</Txt>{' '}
                    <Link to="/privacy" className="font-medium text-link underline underline-offset-2">
                      <Txt>Privacy notice</Txt>
                    </Link>
                    .
                  </span>
                </label>
              )}
              {!error && sessionEnded && (
                <Alert>
                  <Txt>Your session ended. Please sign in again.</Txt>
                </Alert>
              )}
              {error && (
                <Alert>
                  <Txt>{error}</Txt>
                </Alert>
              )}
              <Button size="lg" className="mt-2 w-full" type="submit" disabled={signIn.isPending}>
                {signIn.isPending && <LoaderCircle className="animate-spin" />}
                <Txt>{signIn.isPending ? 'Please wait…' : mode === 'login' ? 'Sign in' : 'Create account'}</Txt>
              </Button>
              {google.data?.enabled && (
                <>
                  <div className="flex items-center gap-3 label-caps text-[12px] text-muted-foreground">
                    <span className="h-0.5 flex-1 rounded-full bg-border" />
                    <Txt>or</Txt>
                    <span className="h-0.5 flex-1 rounded-full bg-border" />
                  </div>
                  <Button asChild variant="secondary" size="lg" className="w-full">
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
                  <p className="text-center text-[13px] text-muted-foreground">
                    <Txt>By continuing with Google, you agree to the terms and privacy notice for new accounts.</Txt>
                  </p>
                </>
              )}
              <button
                type="button"
                className="mx-auto block min-h-11 rounded-xl px-3 label-caps text-[14px] text-link hover:bg-sky-soft"
                onClick={() => {
                  setMode(mode === 'login' ? 'register' : 'login')
                  setEmail('')
                  setPassword('')
                  setShowPassword(false)
                  setAgreed(false)
                  signIn.reset()
                  setRedirectError('')
                }}
              >
                <Txt>{mode === 'login' ? 'New here? Create an account' : 'Already registered? Sign in'}</Txt>
              </button>
              {/* Signing up already links the terms and privacy notice beside its tick box; phones keep the
                  form on one screen by not repeating them, or the emergency line, there. */}
              <p
                className={cn('text-center text-[13px] text-muted-foreground', mode === 'register' && 'max-sm:hidden')}
              >
                <Txt>Not for emergencies. If anyone is in danger, call 911.</Txt>
              </p>
              <LegalLinks className={cn('text-center', mode === 'register' && 'max-sm:hidden')} />
            </form>
          </section>
          <p className="auth-tagline">
            <Txt>A safer barangay starts with you.</Txt>
          </p>
        </div>
      </div>
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {signIn.isPending ? t('Please wait…') : ''}
      </span>
    </main>
  )
}
