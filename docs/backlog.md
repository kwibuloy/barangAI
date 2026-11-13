# Product backlog and decision log

Started 4 November 2026 from a code, security, UX and market audit. This is the one shared list; add to it rather than starting another. Priorities weigh user impact, business value, risk, evidence and effort. Business reasoning is in [business-model.md](business-model.md).

**Evidence:** R = reproduced or measured here. C = read in the code. E = outside source (see business-model.md). H = hypothesis, not yet tested.

## Current state (13 November)

States: Verified complete, Blocked, Deferred, Ready. The tables below keep each item's evidence and acceptance criteria.

| State | Items |
| --- | --- |
| **Verified complete** (branch `improvement/product-audit-implementation`) | B5, B6, P1 (except QR), P2 to P6, P8, P9, P11 to P15, M2 to M8, M9 download, M10, M12 to M14 (M11: the command only), P7 confirm prompt, the 13 November batch (D14), plus the demo batch: synthetic story, demo server and label, blur cue, what your barangay fixed, comparison with last month, city rollup. Android-only and screen-reader parts of P2, P4, P11 and P12 need a device: see Blocked. |
| **Verified complete: deliverables** | Business model, pitch contents, video handoff and Q&A. These are documents: none of them shows demand or validation. |
| **Blocked: owner decision** | Q1 MobileCLIP2 (B1); Q2 rewards (B3), and M1 after it; Q3 pilot buyer; Q4 same-Wi-Fi limit (F1); Q5 white or dark text on the primary button (P10: comparison in `.shots/batch5`); P7 unlink, which needs a status-path exception; M11 (see its row: the photos it would move are missing); approval of `visual-check` screenshots; hall reset procedure in `docs/mobile.md`. |
| **Blocked: outside this work** | B2 counsel; V1 to V4 and V6 conversations with officials and legal opinions; human Filipino review; test on an Android device, real Rokid Glasses, TalkBack and NVDA; CI jobs first run on GitHub (needs a push). |
| **Ready, small** | V5 re-measure AI cost; P1 QR code (needs a library, so an approval). |
| **Deferred** | Section 5 and section 6 below, including B4 (TLS), F1 to F5. |

## Done in the first batches (4 November)

| ID | What changed | Evidence it works |
| --- | --- | --- |
| D1 | Importing the app no longer migrates a database; tests are isolated from real data; the default database and photo paths no longer depend on the current folder | `test_data_safety.py`; live database's modified time unchanged after full test runs |
| D2 | SQLite: write-ahead log, foreign keys on, busy timeout, secure delete, connection pool sized to the server's threads | `test_data_safety.py`; burst figures in feature-status.md |
| D3 | Backup and restore (`deploy/backup.ps1`, `barangai/backup.py`), a copy before every schema upgrade, photos found after moving folders, launcher warns when no backup exists | Restore drill into a different folder in `test_data_safety.py` |
| D4 | Face and plate blur fail closed: a broken install stops the server, and a failed detection pass refuses the photo, instead of keeping faces sharp | `test_data_safety.py`, `test_hardening.py` |
| D5 | Rule fixes: staff can decide deletion requests in the app; "I see this too" can't close a report unreviewed on a resolved case; a resident sees nothing of a case before acceptance | API and web tests |
| D6 | Integrity: a case deleted mid-upload leaves a standalone report; deletion can't remove a photo and then fail to commit because of a slow reader; deleted accounts leave no bytes in the database or usage rows; malformed images give 422, not 500 | `test_data_safety.py` |
| D7 | Honest copy: Kap's privacy facts, short report IDs masked before chat, operator and privacy contact settings reach the launcher, free-hosting wording removed | Tests and reading |
| D8 | Monthly report (`/desk/records`): counts, typical times, backlog age, rejection reasons, CSV and print, limited to the caller's barangay | `test_records.py`, `records.test.tsx`, screenshots awaiting approval |
| D9 | Staff report view: the three category fields no longer overlap; a staff account with no barangay is told why its desk is empty | Screenshots awaiting approval |
| D10 | Security and backend batch, API side (B5, B6, P1 API, M1, M3 to M10, M12 to M14; P7 without unlink): see docs/api.md and docs/architecture.md | `test_admin.py`, `test_limits.py`, `test_points_ledger.py`, `test_links_and_polls.py`, `test_export_erasure_ops.py` |
| D12 | Resident batch: P2, P3, P4, P5, P12, P13 resident side, P14 strings and scan (Filipino review by a person still open), P10 except the primary button, P11 resident side (TalkBack and NVDA not run). Reads refused on a temporary password; a terminal reset makes staff and administrators choose their own; administrators can delete feedback; `backup consolidate-photos` prepared for M11 and not run on real data; M2 | `resident-help.test.tsx`, `contrast.test.ts`, `api-errors-i18n.test.ts`, `mobile-fallback.test.ts`, `test_staff_desk.py`, `test_data_safety.py`, `scripts/journey.mjs`. The Android screens compile but were not run on a device; screenshots await approval |
| D13 | Demo batch: `seed_demo --story`, `DEMO_MODE` label, `deploy/demo.ps1`, blur counts on the Photo step, "What your barangay fixed", comparison with last month, rollup by barangay (admin only, CSV) | `test_demo_story.py`, `records.test.tsx`, `community.test.tsx`, `ai-form.test.tsx`; screenshots in `.shots/batch6` await approval |
| D14 | 13 November batch: P15 (each case has a test); P9 (Overview figures from `GET /reports/counts`, every report the caller may see, a grouped case once); dev-only `npm audit` (vitest 3 to 5, puppeteer-core 24 to 25, `npm audit fix` in web and mobile; 6 low and moderate findings left, all inside the shadcn CLI, which only adds components and has no fix yet); M10 speed (pytest-xdist, `-n auto`, approved by the owner); `ReportForm.tsx` split into one file per step under `reports/form/`, `ReportDetail.tsx` into `reports/detail/`, Filipino strings moved to `lib/locales/fil.ts`; M3 to M8 and M10 checked against their acceptance tests | `test_hardening.py` (follow-up pin source), `test_links_and_polls.py` (counts past the list limit, barangay scope, 304; the existing ten-query and 304 tests for M4), `resident-help.test.tsx` (P15), `staff-desk.test.tsx` (true totals); screenshots of the new staff line, Overview and the report steps approved by the owner on 13 November; 501 API tests in 39 to 55 s with `-n auto` (145 s serial), 239 web tests three runs in a row, typecheck, lint, build. Also fixed: the Overview count-up read the frame's own time stamp, which jsdom (and some browsers) take from another clock, so a figure could show a huge negative number or stay at 0 (`count-up.test.tsx`) |
| D11 | Staff desk batch: P1 (accounts page, first-run checklist, forced password change, phone address as text), P6, P8 (thumbnails, open-only default, saved phrases, save and next, bulk "Start verification"), P9, P11 for staff screens, P13 staff side, M8 screen, P7's confirm prompt (a safety net so far: screens only link pairs staff already confirmed, which skip the check) | `test_staff_desk.py`, `staff-desk.test.tsx`, screenshots awaiting approval |

## Open: 1. Blockers and current risks

| ID | Item | Evidence | Why it matters | Effort | Done when | Lead |
| --- | --- | --- | --- | --- | --- | --- |
| B1 | Replace MobileCLIP2-S0 or get written permission | E, licence says research purposes only | Blocks any paid use; possibly product development too. Owner's call: AGENTS.md keeps it pending review | M | A commercially licensed checker passes `evaluate_ai.py`, or the feature runs without it | CTO |
| B2 | Counsel review: who is the controller, NPC registration, retention, minors, cross-border transfer, unencrypted laptop | R and E | Needed before real residents' data | Outside | Written advice; privacy page updated | Legal |
| B3 | Rewards funded by public money may face COA and Local Government Code limits | E | Could expose a barangay customer; no ruling on points found | Outside | Counsel's view; see decision needed Q2 | Legal/CFO |
| B4 | Real-data rollout on plain HTTP: passwords, cookies and photos are readable on the Wi-Fi | R | Fine for synthetic demos, not for real residents | M | TLS with pinned certificate, or hosting (see F1) | Security |
| B5 | Demo accounts share one password, including admin, on a LAN-reachable server | R | Handing out a resident demo login hands out admin | S | Per-role passwords; `-Lan` refuses demo staff accounts without `-Demo` | Security |
| B6 | No way to disable a staff member or ban an abuser | C | Former officials keep photo access; terms promise restriction | M | `disabled_at`, enforced on the next request; photo-view log | Security |

## Open: 2. Core product and experience

| ID | Item | Evidence | Why it matters | Effort | Done when | Lead |
| --- | --- | --- | --- | --- | --- | --- |
| P1 | Start a barangay without a developer. Left: the address as a QR code (deferred: no QR library in the project, and new dependencies need approval; the address shows as text), and loading barangays still needs a command | C | The biggest barrier to a pilot | S-M | A non-developer gets staff signed in and one synthetic report through, without a terminal | Product |
| P6 | Duplicate review shows both photos, distance and date | C | Staff merge blind, and merging moves other residents' status | S-M | Compare without leaving the report | UX |
| P7 | Grouping can't be undone (the distance check and its prompt are done) | R | A mis-click follows the resident forever and pays points | M | Unlink restores status, points, category and history, audited (status-path exception needs owner) | Backend |
| P8 | Faster triage: thumbnails, open-only default, saved phrases, save and next | C | Daily staff time, which is what a barangay pays for | S each | Pending to Accepted in two choices and two clicks | UX |
| P10 | Contrast left: white on green is 2.09:1 on every primary button. Error text, links, badges, muted text, focus rings and input borders now pass (`contrast.test.ts`) | R (computed) | Hard to read outdoors; fails WCAG AA | S | Owner picks white or dark labels (Q5) and approves the screenshots | UX |
| P11 | Screen reader checks not run. Report steps move focus to the heading and announce the pin; both sides have route titles, row names and a chart table | C | Accessibility and public-sector credibility | S-M | TalkBack report and NVDA status change completed | UX |
| P14 | Filipino review by a person | R | Trust among non-English users | S | A Filipino speaker has read the screens | UX |

## Open: 3. Business validation (business-model.md)

| ID | Experiment | Cost | Supports / invalidates |
| --- | --- | --- | --- |
| V1 | 10 interviews with secretaries and captains, showing a printed monthly report | Time | Is record-keeping a paid pain, and who decides? |
| V2 | Ask for a written letter of intent at a stated price | Time | Willingness to pay at ₱1,500 to ₱5,000 a month |
| V3 | Five HOA or property-manager calls, compared with Citadel and Qmunidad | Time | Whether HOAs want this or already have it |
| V4 | Written opinion on free pilots and vendor gifts (GPPB or a legal officer) | Low | Whether a free pilot is safe to offer |
| V5 | Measure what a real report costs in Cloudflare neurons, on current prompts | Very low | The AI cost line |
| V6 | One-barangay pilot on synthetic training data first, then real data after B2 and B4 | Medium | Whether staff respond and residents report twice |

## Open: 4. Maintainability, performance, operations

| ID | Item | Evidence | Effort | Done when |
| --- | --- | --- | --- | --- |
| M1 | Points: refund after deletion keeps points for a deleted report; merges pay twice; "a day" is rolling; the daily cap applies at acceptance | R | M | Ledger tests cover these sequences. Do after Q2 |
| M9 | Retention schedule (after B2). The self-service download is done (`test_export_erasure_ops.py`) | C | M | A resident downloads their data |
| M11 | Dry run on 13 November (`python -m barangai.backup consolidate-photos`, read-only): the database the app uses, `barangai-dev.db` in the repo root, points to 32 photos and none is on disk. 24 point to `apps/api/private_media`, which no longer exists, and 8 to `private_media`, which is empty (made 12 November). `apps/api/barangai-dev.db` is gone too. Nothing to move until the photos are found; `barangai-backup.sql` (a plain-text PostgreSQL dump, 3 November) is still in the root | R | S | Owner finds the photos or accepts them lost; owner approves deleting the dump |

## Open: 5. Longer term

- Capture now, send later: photo and GPS kept on the phone until the server is back. Large, but softens the same-Wi-Fi limit.
- Bulk status changes past "Start verification". No-pin reports (landmark or barangay only), which change jurisdiction logic.
- Per-barangay settings and SMS notices (about ₱0.56 a text, E).

## Open: 6. Deployment and launch (deliberately last)

| ID | Item | Revisit when |
| --- | --- | --- |
| F1 | Hosting. **The same-Wi-Fi limit means residents can't report from the street**, which is the product's main promise, so a real pilot needs this or capture-and-send-later | The first signed letter of intent, or before V6 uses real residents |
| F2 | TrustedHost, docs flag, Permissions-Policy and related headers, shared rate-limit storage | With F1 |
| F3 | Signed release APK (the documented build is a debug build) | Before any resident installs it |
| F4 | Nominatim: 1 request a second, attribution required; plan a self-hosted or paid fallback | Paying customers |
| F5 | Re-check PostgreSQL and Supabase paths, including foreign keys and fail-closed blur in the container image | With F1 |

## Decision log

| Date | Decision | Why | Who |
| --- | --- | --- | --- |
| 4 Nov 2026 | Project is a startup product, not a hackathon or research project | Owner's statement | Owner |
| 4 Nov 2026 | Local operation is the working environment; deployment is the last phase | Owner's brief | Owner |
| 4 Nov 2026 | First work is data safety, then the monthly report | No one buys a records system that loses records; the report is the first thing a captain would pay for | CEO recommendation; owner may overrule |
| 4 Nov 2026 | Blur fails closed | The privacy promise matters more than accepting a report during a broken install | CEO recommendation; owner may overrule |
| 4 Nov 2026 | Confirming evidence on a resolved case is refused | Matches the rule already on `/cases/link` | CEO recommendation; owner may overrule |
| 4 Nov 2026 | Exports carry no resident identities, photos, descriptions, staff notes or AI output | They leave the app's access control; descriptions can name people | CEO recommendation; owner may overrule |
| 4 Nov 2026 | Points fixes wait for the rewards decision | Small sums, and rewards may change shape after legal review | CEO recommendation; owner may overrule |

## Decisions needed from the owner

- **Q1. MobileCLIP2:** replace it now (recommended), since the licence excludes commercial use and this is now a business?
- **Q2. Rewards:** keep points in the first paid offer, or sell without public-funded rewards until counsel answers (recommended)?
- **Q3. Pilot buyer:** Dasmariñas barangays first (recommended), HOAs, or the city?
- **Q4. Same-Wi-Fi limit:** accept that real resident pilots wait on F1 (recommended), or build capture-and-send-later first?
- **Q5. Primary button label:** keep white on green (2.09:1, Duolingo's look) or switch to the dark label `#131f24` (recommended on readability, since residents use it outdoors)? Comparison: `.shots/batch5/primary-label-current.png` and `primary-label-dark.png`.
