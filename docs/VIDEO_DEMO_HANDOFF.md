# BarangAI video demo: production handoff

Everything needed to produce the video. You don't need any other context. Written 5 November 2026.

| | |
| --- | --- |
| **App** | BarangAI (say it like "barangay": ba-rang-AY) |
| **What it is** | An incident-reporting app for Philippine barangays. A resident photographs a local hazard, AI fills in the report and blurs the faces and plates it finds, barangay staff verify and answer it, and every report ends up in a record leaders can count. |
| **Event** | An AI forum |
| **Audience** | C-level leaders, high-ranking public sector officials and other VIPs |
| **Length** | **Target 70 seconds. Hard limit 75 seconds.** Includes transitions and the closing card. |
| **Your job** | Record, edit, and deliver. Don't publish without the owner's approval. |

## The direction in one line

**"From one photo to a public record": every concern logged, answered, counted, with people in charge of the AI.**

The app stays on screen almost the whole time. Each spoken claim is shown as it's said. The viewer should remember three things:

1. AI does the paperwork and blurs faces and plates.
2. People make every decision.
3. Leaders get numbers they can act on.

## Concepts considered

| | A. From one photo to a public record (**chosen**) | B. People in charge of the AI | C. A captain's month |
| --- | --- | --- | --- |
| **Message** | One report travels from a phone to a leader's record | Responsible AI in public service | A barangay can finally show what it did |
| **Hook** | "A flooded street. A resident tells the barangay. Then what?" | "What should AI never decide alone?" | "What did your barangay fix last month?" |
| **Hero moment** | Status reaches the resident, then the rollup appears | Staff overrule an AI suggestion | The printed monthly report |
| **Proof** | Real end-to-end workflow | The separate category fields | Rollup and comparison |
| **Weakness** | A lot to fit in 70 seconds | Abstract, and shows less of the app | Barely shows the AI, at an AI forum |

**Why A:** it shows the most app, it has an obvious beginning and end, and it carries B's message on the way. C's best screen becomes A's payoff.

## Chosen highlights

| Highlight | Problem it solves | Benefit | Where it's shown | Status |
| --- | --- | --- | --- | --- |
| **AI report and blur** | Reporting is slow, and photos expose bystanders | One photo fills in the report; faces and plates it finds are blurred before saving | Report tab, Photo and Details steps | Works. Blur is covered by automated tests on drawn faces and plates. Cloudflare AI was reported "on" at the 5 Nov rehearsal, but the full AI fill on a real hazard photo must be rehearsed by you. **Accuracy on real photos isn't measured.** |
| **Human decision and live status** | Residents never hear back | Staff verify and explain, and the resident sees it on an open screen in about 5 seconds | Reports queue; report detail on the resident's screen | Works. Passed a real-browser journey on 5 Nov. |
| **Monthly report and rollup** | Leaders can't see what was done | A printable record, with a side-by-side view across barangays | Monthly report as administrator | Works. Screen checked 5 Nov. **All figures come from sample data.** |

Left out of the video to keep it clear, but covered in the pitch: rewards, the community map summary, Filipino screens, Rokid Glasses, staff accounts.

## Voiceover

Warm, clear, unhurried. Pronounce BarangAI as **ba-rang-AY**.

> A flooded street. A resident tells the barangay. Then what?
>
> This is BarangAI: every concern logged, answered, counted.
>
> A resident takes one photo. AI suggests the category, drafts the description and blurs the faces it finds, before anything is saved. The resident checks it and sends.
>
> AI only assists. Barangay staff verify every report and explain each decision. Nothing goes to outside offices automatically.
>
> On an open screen, the resident sees the update within seconds, in the staff's own words.
>
> Then the work adds up. Each month, the barangay gets a record it can print: what came in, what was fixed, how long it took. Across barangays, leaders see the numbers side by side.
>
> Built for barangays, in English and Filipino, with people in charge of every decision.
>
> BarangAI. This is the working app with sample data, and we're looking for our first pilot partners.

**Length:** 145 words. At a comfortable 130 to 150 words a minute, that's about 58 to 67 seconds of speech, inside the 70-second timeline. At the slower end, make the cut below. This is an estimate: **no timed read has been done**, so time your first take.

**If it runs long, cut in this order:**
1. The sentence "Nothing goes to outside offices automatically." (6 words; trim Scene 4)
2. Shorten "what came in, what was fixed, how long it took" only as a last resort, because it's the payoff.

Don't speed up the narration to fit.

## Storyboard

Every timing below is continuous and totals 70 seconds. Keep the **Demo data** label visible wherever the app shows it.

### Scene 1: 0:00 to 0:05. Hook
- **Purpose:** a problem anyone recognises.
- **Screen:** full-frame still of a flooded street (see Assets). Slow push-in. Cut to the phone-width Home screen at 0:04.
- **Voiceover:** "A flooded street. A resident tells the barangay. Then what?"
- **On-screen text:** *Then what?*
- **Notes:** the only non-app shot besides the closing card.

### Scene 2: 0:05 to 0:09. Introduction
- **Purpose:** name the product and its promise.
- **Screen:** resident Home screen. Kap in view. Don't tap yet.
- **Voiceover:** "This is BarangAI: every concern logged, answered, counted."
- **On-screen text:** *Logged. Answered. Counted.*

### Scene 3: 0:09 to 0:22. Hero: AI and blur
- **Purpose:** the AI moment.
- **Screen and action:**
  1. Tap **Report**, then **Choose photo**, and pick the prepared photo.
  2. Hold on the **Photo** step while Kap's bubble shows the blur line and the AI card appears. Expected: *"Kap blurred 1 face. Check that nothing else private shows."*
  3. Tap **Next**. On **Location**, set the pin.
  4. Tap **Next**. On **Details**, show the category and description filled in.
  5. Tap **Next**. On **Review**, tick the confirmation and tap to send. Cut to the success screen.
- **Voiceover:** "A resident takes one photo. AI suggests the category, drafts the description and blurs the faces it finds, before anything is saved. The resident checks it and sends."
- **On-screen text:** *AI drafts. The resident checks.*
- **Notes:** speed-ramp the waiting, never the results. Zoom gently to the blur line. **Depends on the Cloudflare keys and internet**: see Preparation.

### Scene 4: 0:22 to 0:31. People decide
- **Purpose:** the line this audience most wants to hear.
- **Screen and action:** as `staff@demo.test`, go to **Reports** and open the new report. Show the three separate fields (**Resident category**, **AI suggestion**, **Verified category**). Tap a ready-made note such as **Checking the photo**, tap **Start verification**, then choose **Confirmed from the photo**, and tap **Accept report**.
- **Voiceover:** "AI only assists. Barangay staff verify every report and explain each decision. Nothing goes to outside offices automatically."
- **On-screen text:** *People make every decision.*
- **Notes:** zoom to the three fields. This is the proof shot.

### Scene 5: 0:31 to 0:38. The answer arrives
- **Purpose:** the loop closes.
- **Screen and action:** split screen. Staff desktop on the left, resident's open report on the right. The status changes, and the card shows the journey, the staff note and what happens next.
- **Voiceover:** "On an open screen, the resident sees the update within seconds, in the staff's own words."
- **On-screen text:** *Answered.*
- **Notes:** keep this real: it updates by itself in about 5 seconds, with no reload. You may trim the wait, but don't fake it. Don't say "instantly" or "real-time push".

### Scene 6: 0:38 to 0:54. Payoff for leaders
- **Purpose:** the screen this audience will remember.
- **Screen and action:** as `admin@demo.test`, open **Monthly report** at the last full month. Hold on the figures with "faster than last month" lines. Scroll slowly to **Rollup by barangay**. Tap a column heading to sort. Optionally flash **Print**.
- **Voiceover:** "Then the work adds up. Each month, the barangay gets a record it can print: what came in, what was fixed, how long it took. Across barangays, leaders see the numbers side by side."
- **On-screen text:** *Sample data shown* in the corner for the whole scene, alongside *Counted.*
- **Notes:** the scroll must be slow enough to read. **Don't speak any of these numbers**: they're sample data.

### Scene 7: 0:54 to 1:01. Why it's different
- **Purpose:** the takeaway.
- **Screen:** quick cuts: the Photo step in Filipino, then the staff queue, then back to the rollup.
- **Voiceover:** "Built for barangays, in English and Filipino, with people in charge of every decision."
- **On-screen text:** none.
- **Notes:** switch language under Account settings before recording this shot.

### Scene 8: 1:01 to 1:10. Closing card
- **Purpose:** the ask, and the honest label.
- **Screen:** white background, Kap and the BarangAI logo, centred.
- **Voiceover:** "BarangAI. This is the working app with sample data, and we're looking for our first pilot partners."
- **On-screen text:**
  - **BarangAI**
  - **Every concern logged, answered, counted.**
  - Pilot partners welcome · [owner's contact details]
  - *Working app shown with sample data. AI suggestions are reviewed by people.*
- **Notes:** hold for at least 2 seconds after the voice stops. **Unresolved:** the owner must supply contact details.

| Scene | Start | End | Seconds |
| --- | --- | --- | --- |
| 1 Hook | 0:00 | 0:05 | 5 |
| 2 Introduction | 0:05 | 0:09 | 4 |
| 3 AI and blur | 0:09 | 0:22 | 13 |
| 4 People decide | 0:22 | 0:31 | 9 |
| 5 The answer arrives | 0:31 | 0:38 | 7 |
| 6 Payoff | 0:38 | 0:54 | 16 |
| 7 Why it's different | 0:54 | 1:01 | 7 |
| 8 Closing card | 1:01 | 1:10 | 9 |
| **Total** | | | **70** |

## Preparation

You need a Windows laptop with this repository, Python 3.12, Node.js 22 and Chrome.

**Blocker:** this work is on the local branch `improvement/product-audit-implementation`, which hasn't been pushed. If you aren't using the owner's laptop, ask the owner to share it.

```powershell
git switch improvement/product-audit-implementation
```

First-time setup, if `.venv` and `apps/web/node_modules` don't exist yet:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -e "./apps/api[test,ai]" -c deploy/constraints-render.txt
npm --prefix apps/web ci
```

Each recording session:

```powershell
npm --prefix apps/web run build
.\deploy\demo.ps1 -Fresh
```

This creates a throwaway database under `demo/`, fills it with sample data, labels every screen **Demo data**, and serves the app on `http://127.0.0.1:8001`. It never touches real data.

- **Startup check:** the window must say `Cloudflare photo descriptions: on`. If it says off, ask the owner for the keys for the git-ignored `.env` file. You also need internet. Without Cloudflare the AI description won't appear, so **don't record Scene 3 that way**, and don't fake it.
- **Passwords:** in `demo/passwords.txt`. Keep that file out of every shot.
- **Accounts:**
  - Resident: `resident1@demo.test`
  - Staff: `staff@demo.test` (barangay Salitran II)
  - Administrator: `admin@demo.test`
- **The pin:** enter latitude `14.34342`, longitude `120.93905`, the centre of Salitran II's shape. This keeps the report in that staff member's queue. If the app offers to add to an existing nearby issue, choose to send a new report, or move the pin slightly, and run it again.

### Assets

| Asset | Where | Notes |
| --- | --- | --- |
| Logo | `apps/web/public/icons/icon-512.png` | Don't redraw or recolour |
| Kap the owl | `apps/web/src/assets/kap/` (for example `cheer.webp`, `clipboard.webp`) | Don't redraw or regenerate |
| Font | Nunito, in the app as `@fontsource-variable/nunito` | Use for all captions |
| Colours | Green `#58cc02`, blue `#1cb0f6`, white background | Use only these for graphics |
| Report photo and Scene 1 still | Your own staged photo, or `showreel/build/commons/flooding.jpg` from the owner's laptop | Any Commons photo is CC0 and credited on the existing showreel's end card; add the credit. That file isn't confirmed to be in Git. |

**The blur moment needs a face in the photo, and the project's rule is synthetic people only.** Use a staged scene with a printed synthetic face, such as a drawn or generated portrait on a poster in the shot. Test it first: **the cue appears only if the detector really finds it.** If it doesn't, try another picture. If nothing works, cut the blur line from the voiceover and the zoom, rather than faking it. Ask the owner before using any real person, even with consent.

### Recording

- **Resident screens:** Chrome DevTools device mode at 390 x 844, recorded at 2x or higher. This is the same web app the Android shell loads, and it's what was rehearsed.
- **Android, optional:** only if rehearsed first. The Android shell's new screens haven't run on a device. It needs `.\deploy\demo.ps1 -Lan`, `npx cap sync android`, and the phone on the same Wi-Fi.
- **Staff and admin screens:** 1280 x 800 browser window, 100% zoom, light theme.
- **Before recording:** hide the bookmarks bar, notifications and other tabs. Use a clean browser profile.
- **Sequence:** resident flow, then staff actions with the resident screen open beside it, then Monthly report. Record all takes in that order.
- **Retakes:** close the server with Ctrl+C, run `.\deploy\demo.ps1 -Fresh`, and sign in again. Passwords change each time. Fresh data also means the figures may shift by date; choose the same month across takes.
- **Monthly report month:** use the last full month. The current month compares only partial data and can look thin.

### Editing

- Cursor: slow and deliberate, no circling. Pause before each tap.
- Zooms: at most one per scene, and only to make text readable, as a soft 1.2 to 1.5x ease.
- Transitions: plain cuts or short dissolves under 0.4 seconds.
- Captions: burn in the full voiceover in Nunito with a soft background. Keep separate from the on-screen text above. Many forum screens will play muted.
- Music: light and low, or none. Check the licence.
- Speed-ramp waiting only. Never alter a number, label or status, or stitch screens to imply something the app didn't do.

## Hide from every shot

- `demo/passwords.txt`, `.env`, terminal windows with keys, password fields
- Real email accounts, browser profiles or personal notifications
- The real database, `barangai-dev.db`, or any screen outside the demo server on port 8001
- Any real person's face, plate number or home address

## What the video must not say or imply

- Customers, users, partners, testimonials or revenue: **there are none yet**
- Any accuracy figure, or that the AI is "accurate": **not measured on real photos**
- That all faces or plates are always caught: **blur is best-effort and can miss some**
- That any time was saved, or that any figure on screen is a real result: **it's sample data**
- That it's live or deployed: **it runs locally, on one laptop**
- "Real-time" or "instant": **an open screen checks about every 5 seconds**
- Certified, compliant or government-approved: **no such status exists**

## Final checklist

- [ ] Total length between 60 and 75 seconds, closing card included
- [ ] Voiceover matches this script, and BarangAI is said ba-rang-AY
- [ ] **Demo data** label visible, plus *Sample data shown* in Scene 6 and the closing line
- [ ] All footage is the real app; nothing faked or composited into a screen
- [ ] Blur cue and AI fill were real on the take used
- [ ] Text is readable on a phone screen and on a large stage screen, sound off
- [ ] Nothing from "Hide from every shot" is visible, checked frame by frame in the staff and admin scenes
- [ ] Contact details on the closing card are confirmed by the owner
- [ ] Image and music credits are added
- [ ] Owner has approved the final cut before anyone shares it

## Verification behind this brief

Rehearsed on 5 November 2026: the demo script started on a throwaway folder, Monthly report and rollup, the blur cue and community screens were captured and read, and a real-browser journey from report to resolved, reward and deletion passed all steps.

**Not rehearsed:** the exact Scene 3 take with a real hazard photo and the Cloudflare AI fill; recording itself; any Android device; a timed read of the script. Your first full run-through is the real test, so please report anything that doesn't match this brief.
