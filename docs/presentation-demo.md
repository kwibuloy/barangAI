# Demo video and pitch

The story to tell: **every concern logged, answered, countable.** The audience is C-level leaders, public sector officials and other high-ranking officials, so lead with the monthly report, the comparison with last month and the rollup by barangay. AI and points are supporting detail (why: [business-model.md](business-model.md)).

The full video script is in [VIDEO_DEMO_HANDOFF.md](VIDEO_DEMO_HANDOFF.md) and the pitch in [PITCH_CONTENTS.md](PITCH_CONTENTS.md). This page holds the setup, a brief shot list and the claims we must not make.

## Set up the recording

```powershell
cd apps/web; npm run build; cd ../..
.\deploy\demo.ps1 -Fresh        # add -Lan for the Android app on the same Wi-Fi
```

- It creates a throwaway database and photo folder under `demo/` (git-ignored), loads the Dasmariñas boundaries, seeds the synthetic story, sets `DEMO_MODE=true` and serves on http://127.0.0.1:8001. The real `barangai-dev.db` and `private_media` aren't touched. `-Fresh` starts again.
- Passwords are in `demo/passwords.txt`; the script gives the path and doesn't print them. Keep that file out of the shot.
- Accounts: `resident1@demo.test` (reports in Salitran II; `resident2` to `resident80` also exist), `staff@demo.test` (Salitran II), `staff-sampaloc-i@`, `staff-burol-i@`, `staff-paliparan-ii@` and `admin@demo.test`.
- Cloudflare descriptions and Kap's brief run only if `.env` has the keys, as with `start-local.ps1`. Without them the checker or a manual choice stands in; film whichever is real on the day and don't describe the other.
- Open the monthly report at the last full month (`/desk/records?month=YYYY-MM`). The month in progress compares only with the same days of last month, and early in a month it looks thin.
- For the photo step, use a staged or drawn picture with a synthetic face. Never a real person's.

**The data is written, not measured.** The improving trend comes from the numbers at the top of `apps/api/barangai/seed_story.py`. Barangay names and boundaries are real; the reports, residents, streets (all "Demo ...") and timings are not. Flooding and fallen trees use CC0 photos by Judgefloro and JFVelasquez Floro from Wikimedia Commons (licences in `showreel/build/commons/credits.json`, git-ignored, so other machines get drawn scenes): those show other places, in Bulacan, so credit them on the end card and don't imply they show Dasmariñas. Every other category is a drawn scene.

## Shot list

The "Demo data" chip stays in frame on every app shot; the printed report carries its own line.

| # | Screen, role | Action | What may honestly be said |
| --- | --- | --- | --- |
| 1 | Report, Photo; resident, phone | Choose a staged photo with a drawn face; Kap says what it blurred | "It blurs what it finds and asks the resident to check. It can miss some." |
| 2 | Review and sent; resident, phone | Check the details, tick, submit | "The AI suggests; the resident decides. The report is logged and in the barangay's queue." |
| 3 | Reports, report detail; staff, desktop | Open it, accept with a verified category and a note; reject another with a reason | "Staff verify every report, and each status change needs a description the resident can read." |
| 4 | Updates; resident, phone | Open the update | "The resident sees the status and what staff wrote, within seconds while the app is open, on the same Wi-Fi." |
| 5 | Community map; resident, phone | Show "What your barangay fixed" | "Counts only, from staff-verified reports, nothing below 3 incidents. This is demo data." |
| 6 | Monthly report; staff, desktop | Open last month | "Counted from stored records, here synthetic. Each figure says how it changed from last month." Not "response times improved". |
| 7 | Monthly report, printed | Print preview | "Ready for a council meeting, with no resident names or photos." (Staff: one A4 sheet. Administrators: two, with the rollup.) |
| 8 | Rollup by barangay; administrator, desktop | Show it in name order, download | "An administrator's view across barangays; staff can't open it." Name no best or worst barangay: real names, invented numbers. |
| 9 | End card | | "Demo data on a test server", plus the photo and boundary credits above. |

For market facts, use [business-model.md](business-model.md) with its [V], [P] and [A] tags and its sources list, and check them again before a pitch. No customers, revenue or interviews exist yet; the prices are test prices.

## Claims we must not make

| Don't say | Because | Say instead |
| --- | --- | --- |
| Any customer, pilot, user or barangay "uses BarangAI" | None does; nobody has been interviewed | "We're looking for a first barangay" |
| A barangay's figures, trend or speed as results | The story is synthetic and the trend was written in | "Here's what the report looks like, on demo data" |
| An accuracy figure, or "AI detects hazards" | No field evaluation; only synthetic and tune/test sets exist. The cutoff isn't field calibrated | "The AI suggests and a person verifies" |
| "Faces and plates are removed", "fully private" | Blur is best effort. It misses side-on, hidden or small faces, and the plate model was trained on Chinese plates and tuned on drawn ones | "It blurs what it finds and asks the resident to check" |
| "Real time", "instant" | Polling: notices about every 5 seconds, reports about every 15 | "Within seconds while the app is open" |
| Reporting "from the street", "anywhere" | Same Wi-Fi as the laptop today (backlog F1) | "On the same Wi-Fi for now; hosting comes before a real pilot" |
| "Ready for real residents' data" | Plain HTTP on the Wi-Fi, an unencrypted laptop, counsel review not done (B2, B4), and the only copy on one laptop | "Before real data we need hosting, TLS and legal review" |
| "Commercially ready AI" | MobileCLIP2's licence says research purposes only; the owner's review is open (B1) | "The category checker's licence is research-only and under review; it will be replaced or licensed before any sale" |
| "Forwards reports to the city, the utility or the police" | Reports are never auto-forwarded to outside offices | "Staff decide what to do next" |
| Rewards are legal, funded or redeemable for money | Public-funding limits are unresolved (B3, Q2); the app moves no money; the shop holds samples | "A possible feature, under legal review" |
| Hiding the demo label, cropping out the chip, or editing out "Demo data" on the print | It's what keeps this honest | Keep it in frame |
