# Kap animated authentication

Kap is enabled by default on the normal login and registration page. No preview query parameter is required.

## Behavior

- Idle: restrained breathing/head glance and occasional blinks.
- Desktop: clipped pupils follow the pointer before the head; the torso stays still.
- Mobile/keyboard: Kap looks toward the focused non-password field. Short mobile viewports hide the decoration to keep room for the keyboard.
- Password: brief surprise, independently raised feathered wings, then both eyes covered. Input and Show/Hide share one privacy interaction.
- Reveal: eyes close immediately; the wings stay raised, the head/hat animate toward the approved covered-away endpoint. Hiding turns back; leaving privacy lowers the wings. Rapid focus/toggle changes cancel obsolete timers.
- Authentication: immediate accessible form feedback. After 200ms, eligible non-private requests use feathered wingbeats, slight hover and eyes-led scanning on an independent 3.7-second cycle. Private requests never patrol. Errors briefly show concern and recover; successful navigation never waits for motion.
- Reduced motion: static private states, no continuous motion or tracking. Background tabs pause motion and remove active tracking. Low-core devices reduce secondary movement.

## Smooth gestures and full-screen loading update

The relaxed feathers now extend beyond the SVG viewbox and disappear naturally behind a fully opaque foreground card. This removes the exposed straight-cut wing ends. The two wing transitions are eased over 480/460ms with a small stagger. Breathing is more visible on a 3.6-second cycle, and the gaze follows the last rendered email character while the field is focused, even when the pointer moves.

Eligible requests lasting more than 200ms open a full-screen scene. Kap grows from his position above the card toward the viewer, then hovers centrally with wingbeats and an independent looking-around scan. Branding, landscape, greeting, card and tagline fade away; the form remains mounted but inert and hidden from accessibility. The only visible actor is Kap on a soft sky gradient. A single live loading announcement remains outside the hidden content.

Password privacy is latched at submission: Enter from the password field uses a full-screen covered pose instead of opening the eyes when the form becomes inert. Revealed passwords show the fully covered bust frame. Reduced motion uses the same full-screen presentation with a static actor and no zoom/wingbeats. If flight art is unavailable, approved neutral art is used. Failed authentication retreats over 380ms, restores the form and the previously focused control, and keeps the original error. Successful routing never waits for the effect.

`KapLoadingScene.tsx` renders the decorative portal. `AuthPage.tsx` owns the hidden/inert UI, status announcement and focus restoration. No artificial network or navigation delay is introduced. No video is generated for this update.

## Smooth gestures and full-screen loading update

The relaxed feathers now extend beyond the SVG viewbox and disappear naturally behind a fully opaque foreground card. This removes the exposed straight-cut wing ends. The two wing transitions are eased over 480/460ms with a small stagger. Breathing is more visible on a 3.6-second cycle, and the gaze follows the last rendered email character while the field is focused, even when the pointer moves.

Eligible requests lasting more than 200ms open a full-screen scene. Kap grows from his position above the card toward the viewer, then hovers centrally with wingbeats and an independent looking-around scan. Branding, landscape, greeting, card and tagline fade away; the form remains mounted but inert and hidden from accessibility. The only visible actor is Kap on a soft sky gradient. A single live loading announcement remains outside the hidden content.

Password privacy is latched at submission: Enter from the password field uses a full-screen covered pose instead of opening the eyes when the form becomes inert. Revealed passwords show the fully covered bust frame. Reduced motion uses the same full-screen presentation with a static actor and no zoom/wingbeats. If flight art is unavailable, approved neutral art is used. Failed authentication retreats over 380ms, restores the form and the previously focused control, and keeps the original error. Successful routing never waits for the effect.

`KapLoadingScene.tsx` renders the decorative portal. `AuthPage.tsx` owns the hidden/inert UI, status announcement and focus restoration. No artificial network or navigation delay is introduced. No video is generated for this update.

## Architecture

`AuthKap.tsx` coordinates interaction flags, asset readiness and priority. It receives no password content. `useKapPrivacy.ts` handles cancellable privacy choreography. `useKapMotion.ts` handles CSS-variable pointer/focus tracking, blinking and delayed patrol/landing, and reports each target point so `KapRig.tsx` can choose a gaze frame. Sign-in Kap is drawn only from the owner's bust frames (`KapBuddy.tsx`, cut by `scripts/kap.py --cells` to whole grid cells so they swap in place): eight look frames for the cursor and email caret, a blink frame, and the cover sequence. A hidden password raises his wings frame by frame to one cheeky peeking eye; a shown password lands on fully covered eyes on the same render, with no open-eyed frame on the way. Every other screen uses the full-body sticker poses (`components/Kap.tsx`), never the bust frames. `KapFlightRig.tsx` and `KapEyes.tsx` still draw the patrol flight. Flight haze is removed with a non-destructive SVG alpha transfer.

Public mascot images are distinct from private report photos. Existing API, cookies, CSRF, routing, registration validation and optional OAuth behavior are preserved. Flight/landing does not extend navigation or network requests.

## Run locally

Follow the root README. Use Python 3.12+ and Node.js 22+.

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -c deploy/constraints-render.txt -e './apps/api[test,ai]'
cd apps/web
npm ci
npm run build
cd ../..
.\deploy\start-local.ps1 -Port 8001
```

Open http://127.0.0.1:8001/. The local launcher uses SQLite and private local storage. Cloudflare and Google credentials are optional; mascot animation does not require them. Use synthetic accounts for demos.

The handoff ZIP includes a built `apps/web/dist`, so installation of frontend dependencies/build can be skipped for simply running that exact packaged build. Install Node dependencies when developing or rebuilding.

## Checks

From `apps/web`, run `npm test` and `npm run build`. Timing tests cover blink cancellation, patrol eligibility, short requests, reduced-motion/privacy conflicts, stale transition cancellation and cleanup. Browser QA also exercises real local failed login/registration, cursor/focused-field behavior, mobile layouts and reduced motion. An actual phone keyboard, assistive technology and hardware FPS benchmarks remain outside the automated verification.

## Scope

Local implementation only. No credentials, database contents or private uploads belong in a handoff package. No commits, push, PR or deployment is performed by this work.

## Last-character email tracking

Email focus follows the last rendered character, not the middle of the field. A reusable hidden measurement span matches the input font/spacing and accounts for padding, borders, alignment and horizontal scrolling. Typing, paste, deletion, composition, scrolling and resize update geometry once per animation frame. Email inputs do not expose native caret geometry, so the target is explicitly the final character. No new React/form state is created for gaze updates. Password inputs are rejected before value access, and the measurement span/listeners/frame are removed when privacy disables tracking or the component unmounts. Six browser checks and a password-isolation unit test cover this update.
