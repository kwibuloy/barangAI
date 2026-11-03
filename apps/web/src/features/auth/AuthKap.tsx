import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import authReference from '../../assets/auth-reference.png'
import covered from '../../assets/kap-cover-eyes-approved-v1.png'
import away from '../../assets/kap-turn-away-approved-v1.png'
import neutral from '../../assets/kap-neutral-approved-v2.png'
import flight from '../../assets/kap-flight-approved-v2.png'
import { KapPrivacyRig } from './KapPrivacyRig'
import { KapLoadingScene } from './KapLoadingScene'
import { useKapPrivacy } from './useKapPrivacy'
import { useKapBlink, useKapFlight, useKapTracking } from './useKapMotion'

/** The mascot receives interaction flags only. Authentication never waits for decoration. */
export function AuthKap({
  privacyFocus,
  revealed,
  pending,
  failed,
  onLoadingChange,
}: {
  privacyFocus: boolean
  revealed: boolean
  pending: boolean
  failed: boolean
  onLoadingChange?: (active: boolean) => void
}) {
  const root = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState({ covered: false, away: false, neutral: false, flight: false })
  const [requestPrivate, setRequestPrivate] = useState(false)
  const [origin, setOrigin] = useState<{ x: number; y: number; scale: number } | null>(null)
  const wasPresenting = useRef(false)
  useLayoutEffect(() => {
    if (pending) {
      setRequestPrivate(privacyFocus || revealed)
      return
    }
    const timer = window.setTimeout(() => setRequestPrivate(false), 460)
    return () => clearTimeout(timer)
    // Snapshot privacy only at submission; hiding/inerting the form must not revoke it.
  }, [pending])
  const [reactingToError, setReactingToError] = useState(false)
  const [pageVisible, setPageVisible] = useState(() => document.visibilityState !== 'hidden')
  const [compact, setCompact] = useState(false)
  const [lightweight] = useState(() => navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 4)
  useEffect(() => {
    const visibility = () => setPageVisible(document.visibilityState !== 'hidden')
    const resize = () => setCompact(innerWidth <= 900 && (window.visualViewport?.height ?? innerHeight) < 560)
    document.addEventListener('visibilitychange', visibility)
    window.addEventListener('resize', resize)
    window.visualViewport?.addEventListener('resize', resize)
    resize()
    return () => {
      document.removeEventListener('visibilitychange', visibility)
      window.removeEventListener('resize', resize)
      window.visualViewport?.removeEventListener('resize', resize)
    }
  }, [])
  useEffect(() => {
    setReactingToError(failed)
    if (!failed) return
    const timer = window.setTimeout(() => setReactingToError(false), 900)
    return () => clearTimeout(timer)
  }, [failed])
  const rigReady = ready.covered && ready.away && ready.neutral
  const { phase, reduced } = useKapPrivacy(privacyFocus || requestPrivate, revealed, rigReady)
  const privacy = privacyFocus || revealed || requestPrivate
  const pose = revealed ? 'away' : 'covered'
  const { flying, landing, presenting } = useKapFlight(pending, rigReady, privacy, reduced, pageVisible)
  const showingFlight = presenting || landing
  useLayoutEffect(() => {
    if (presenting && !wasPresenting.current) {
      const box = root.current?.getBoundingClientRect()
      const viewportH = window.visualViewport?.height ?? innerHeight
      const targetWidth = Math.min(innerWidth * 0.92, 820)
      setOrigin({
        x: box?.width ? box.left + box.width / 2 - innerWidth / 2 : 0,
        y: box?.height ? box.top + box.height / 2 - viewportH / 2 : -viewportH * 0.16,
        scale: box?.width ? Math.max(0.22, Math.min(0.92, (box.width / targetWidth) * 1.42)) : 0.35,
      })
    }
    wasPresenting.current = presenting
    onLoadingChange?.(presenting)
  }, [presenting, onLoadingChange])
  useEffect(() => () => onLoadingChange?.(false), [onLoadingChange])
  useEffect(() => {
    if (!showingFlight) setOrigin(null)
  }, [showingFlight])
  const state = privacy
    ? pose
    : flying
      ? 'patrol'
      : presenting
        ? 'loading-static'
        : landing
          ? 'landing'
          : pending
            ? 'pending'
            : reactingToError
              ? 'error'
              : 'idle'
  const interactive =
    rigReady && !privacy && phase === 'idle' && !pending && !reactingToError && !reduced && pageVisible && !compact
  useKapTracking(root, interactive)
  const blink = useKapBlink(
    rigReady && !privacy && !reduced && pageVisible && !compact && phase === 'idle' && !reactingToError,
  )
  return (
    <div
      ref={root}
      className="auth-kap-slot"
      data-state={state}
      data-page-visible={pageVisible}
      data-compact={compact}
      data-phase={phase}
      data-reduced={reduced}
      data-blink={blink}
      data-quality={reduced ? 'static' : lightweight ? 'light' : 'full'}
      aria-hidden="true"
    >
      <div className="auth-kap-art" style={{ visibility: privacy || rigReady ? 'hidden' : 'visible' }}>
        <img src={authReference} alt="" draggable={false} />
      </div>
      {(['neutral', 'flight'] as const).map(name => (
        <img
          key={name}
          src={name === 'neutral' ? neutral : flight}
          alt=""
          hidden
          data-asset={name}
          onLoad={() => setReady(value => ({ ...value, [name]: true }))}
          onError={() => setReady(value => ({ ...value, [name]: false }))}
        />
      ))}
      {rigReady && (
        <div
          className="kap-regular-stage"
          style={{ visibility: showingFlight || phase === 'away' ? 'hidden' : 'visible' }}
        >
          <KapPrivacyRig phase={phase} blink={blink} failed={reactingToError && !privacy} />
        </div>
      )}
      {showingFlight && origin && (
        <KapLoadingScene
          origin={origin}
          landing={landing}
          reduced={reduced}
          blink={blink}
          privatePose={privacy ? pose : ready.flight ? null : 'neutral'}
        />
      )}
      {(['covered', 'away'] as const).map(name => (
        <img
          key={name}
          src={name === 'covered' ? covered : away}
          alt=""
          draggable={false}
          className="auth-kap-privacy"
          data-pose={name}
          decoding="async"
          loading="eager"
          onLoad={() => setReady(value => ({ ...value, [name]: true }))}
          onError={() => setReady(value => ({ ...value, [name]: false }))}
          style={{
            visibility:
              privacy && pose === name && ready[name] && (!rigReady || phase === 'away') ? 'visible' : 'hidden',
          }}
        />
      ))}
    </div>
  )
}
