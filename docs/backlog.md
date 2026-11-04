# Product backlog and decision log

Started 4 November 2026 from a code, security, UX and market audit. This is the one shared list; add to it rather than starting another. Priorities weigh user impact, business value, risk, evidence and effort. Business reasoning is in [business-model.md](business-model.md).

**Evidence:** R = reproduced or measured here. C = read in the code. E = outside source (see business-model.md). H = hypothesis, not yet tested.

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
| P2 | Friendly screen when the server can't be reached (Filipino too), instead of an address prompt | C | First thing residents see when away from the Wi-Fi | S | Server off: translated screen with Retry | UX |
| P3 | Network errors: friendly message, upload timeout, "offline · last updated" strip, no sign-in screen on a 5xx | C | Raw "Failed to fetch"; a server error looks like being signed out | S-M | Server stopped mid-session: strip appears within about 20 s | UX |
| P4 | Keep report drafts across tab switches, reloads and re-sign-in | C | Tapping another tab loses the photo and pin | M | Draft restored; other accounts never see it; wiped after sending or 24 h | UX |
| P5 | Top of report detail: state, latest staff note, what happens next; "still not fixed" as a linked new report | C and E (first experience drives repeat reports) | Follow-through is the retention driver | S-M | All six statuses show a next step | Product |
| P6 | Duplicate review shows both photos, distance and date | C | Staff merge blind, and merging moves other residents' status | S-M | Compare without leaving the report | UX |
| P7 | Grouping can't be undone (the distance check and its prompt are done) | R | A mis-click follows the resident forever and pays points | M | Unlink restores status, points, category and history, audited (status-path exception needs owner) | Backend |
| P8 | Faster triage: thumbnails, open-only default, saved phrases, save and next | C | Daily staff time, which is what a barangay pays for | S each | Pending to Accepted in two choices and two clicks | UX |
| P9 | Counts come from the server (figures now equal the lists they open; both stop at the newest 2,000) | C | Lists cut at 2,000 | S-M | A barangay past 2,000 reports still sees true totals | UX |
| P10 | Contrast: white on green is 2.09:1 on every primary button; also error text, badges, focus rings | R (computed) | Hard to read outdoors; fails WCAG AA | S | Token check at 4.5:1 and owner's screenshot approval | UX |
| P11 | Screen reader and keyboard gaps, resident side: focus on step change. Staff screens have route titles, row names and a chart table; NVDA check not run | C | Accessibility and public-sector credibility | S-M | TalkBack report and NVDA status change completed | UX |
| P12 | Location dead-end: Next disabled with no reason, pin drawn when none is set | C | Blocks a report with no explanation | S | Told exactly what to do with GPS denied | UX |
| P13 | Help path, resident side: "ask your barangay hall" on sign-in, barangay contact details, an entry to `POST /feedback` (staff side done) | C | Locked-out residents have nowhere to go | S-M | Reachable from sign-in and failed chat in both languages | Support |
| P14 | Remaining translation gaps: 15 API errors, native dialog; hide "Already reported" for grouped cases; Filipino review by a person | R | Trust among non-English users | S | A test fails on an untranslated API error | UX |

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
| M2 | One browser end-to-end journey on a real server; CI job with the `ai` extra so blur tests run | C | M | Runs in CI, blur tests not skipped |
| M3 | Product metrics command computed from the database, with no third-party analytics (business-model.md) | C | S | Prints activation, follow-through and retention |
| M4 | Admin report list: N+1 on barangay names, 1.7 MB every 15 s at 2,000 reports; add indexes; ETag or `?since=` | R | S-M | Ten queries or fewer; unchanged poll returns 304 |
| M5 | A confirmed duplicate can end with no shared case when linking then fails | R | S | No suggestion confirmed without a case |
| M6 | Per-address caps so one device can't use the whole site's daily allowance | R | S | One address can't exhaust the signup or report cap |
| M7 | Weak passwords, slow-lockout, and an identity check for hall resets | R | S | Common passwords refused; written reset procedure |
| M8 | Admin log of rewards and codes: who priced, redeemed and honoured | R | M | Any code can be traced |
| M9 | Self-service data download; retention schedule (after B2) | C | M | A resident downloads their data |
| M10 | Log to a rotating file; faster tests (195 s) with a template database | R | S | Under 90 s; failures survive closing the window |
| M11 | Move the 24 photos under `apps/api/private_media` into `private_media`, then remove the stray `apps/api/barangai-dev.db` and old `barangai-backup.sql` (a plain-text PostgreSQL dump) | R | S | Owner approves deleting them; all photos load |
| M12 | Dependencies: install with the constraints file; add `pip-audit` and `npm audit` to CI (no Python vulnerability scan has run) | C | S | CI fails on known-vulnerable pins |
| M13 | Move psycopg2 to an optional extra | C | S | Base install works without it |

## Open: 5. Longer term

- Capture now, send later: photo and GPS kept on the phone until the server is back. Large, but softens the same-Wi-Fi limit.
- Bulk status changes past "Start verification". No-pin reports (landmark or barangay only), which change jurisdiction logic.
- Per-barangay settings, city rollup report and SMS notices (about ₱0.56 a text, E).

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
