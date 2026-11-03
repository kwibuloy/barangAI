import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { m } from 'motion/react'
import { Eye, EyeOff, LoaderCircle } from 'lucide-react'
import { AuthKap } from './AuthKap'
import './auth.css'
import { Alert } from '@/components/page'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { LanguageSwitch, Txt, useText } from '../../lib/i18n'
import { LegalLinks } from '../legal/LegalPage'
import { useGoogleConfig, useSignIn } from './queries'

const GOOGLE_ERRORS: Record<string, string> = {
  google_cancelled: 'Google sign-in was cancelled. Try again or use your password.',
  google_invalid_state: 'Google sign-in expired. Please try again.',
  google_failed: 'Google sign-in is unavailable right now. Try again or use your password.',
  google_email_unverified: 'Use a verified Google email address to sign in.',
  google_account_exists: 'This email already has an account. Sign in with your password.',
  google_resident_only: 'Google sign-in is available for resident accounts only.',
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
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [privacyFocus, setPrivacyFocus] = useState(false)
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
  return (
    <main className="auth-scene" data-loading-stage={loadingStage}>
      <div className="auth-ui" inert={loadingStage} aria-hidden={loadingStage || undefined}>
        <div className="auth-landscape auth-landscape-left" aria-hidden="true" />
        <div className="auth-landscape auth-landscape-right" aria-hidden="true" />
        <header className="auth-brand">
          <span>
            <svg width="65" height="65" viewBox="0 0 65 65" aria-hidden="true">
              <defs>
                <linearGradient id="auth-brand-blue" x2="0" y2="1">
                  <stop stopColor="#008aff" />
                  <stop offset="1" stopColor="#0054eb" />
                </linearGradient>
              </defs>
              <rect width="65" height="65" rx="14" fill="url(#auth-brand-blue)" />
              <g transform="translate(32.5 32.5)">
                {Array.from({ length: 8 }, (_, i) => (
                  <rect
                    key={i}
                    x="-3"
                    y="-25"
                    width="6"
                    height="11"
                    rx="3"
                    fill="#ffdd00"
                    transform={`rotate(${i * 45})`}
                  />
                ))}
                <circle r="11" fill="white" />
              </g>
            </svg>
            <span>BarangAI</span>
          </span>
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
            <span className="auth-greeting">
              Hello! 👋
              <br />
              Welcome back!
            </span>
          </div>
          <section className="auth-card" aria-labelledby="auth-heading">
            <m.form onSubmit={submit} className="auth-form" aria-busy={signIn.isPending}>
              <div className="auth-heading">
                <h1 id="auth-heading">
                  <Txt>{mode === 'login' ? 'Welcome back' : 'Create an account'}</Txt>
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
              <div
                className="space-y-1.5"
                data-password-area
                onFocusCapture={() => setPrivacyFocus(true)}
                onBlurCapture={event => {
                  if (!event.currentTarget.contains(event.relatedTarget)) setPrivacyFocus(false)
                }}
              >
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
                    <Link to="/terms" className="font-medium text-primary underline underline-offset-2">
                      <Txt>Terms and conditions</Txt>
                    </Link>{' '}
                    <Txt>and the</Txt>{' '}
                    <Link to="/privacy" className="font-medium text-primary underline underline-offset-2">
                      <Txt>Privacy notice</Txt>
                    </Link>
                    .
                  </span>
                </label>
              )}
              {error && (
                <Alert>
                  <Txt>{error}</Txt>
                </Alert>
              )}
              <Button size="lg" className="auth-submit w-full" type="submit" disabled={signIn.isPending}>
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
                  <p className="text-center text-[13px] text-muted-foreground">
                    <Txt>By continuing with Google, you agree to the terms and privacy notice for new accounts.</Txt>
                  </p>
                </>
              )}
              <button
                type="button"
                className="auth-switch mx-auto block min-h-11 px-2 text-[15px] font-medium text-primary"
                onClick={() => {
                  setMode(mode === 'login' ? 'register' : 'login')
                  signIn.reset()
                  setRedirectError('')
                }}
              >
                <Txt>{mode === 'login' ? 'New here? Create an account' : 'Already registered? Sign in'}</Txt>
              </button>
              <p className="text-center text-[13px] text-muted-foreground">
                <Txt>Not for emergencies. If anyone is in danger, call 911.</Txt>
              </p>
              <LegalLinks className="text-center" />
            </m.form>
          </section>
          <p className="auth-tagline">A safer barangay starts with you.</p>
        </div>
      </div>
      <span className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {signIn.isPending ? t('Please wait…') : ''}
      </span>
    </main>
  )
}
