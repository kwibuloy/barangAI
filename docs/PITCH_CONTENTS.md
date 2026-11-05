# BarangAI: startup pitch contents

For an AI forum of C-level leaders, high-ranking public sector officials and other VIPs. There's no Q&A slot, so the pitch states its own limits. Backup answers are in [PITCH_QA.md](PITCH_QA.md). Written 5 November 2026. Say the name like "barangay": ba-rang-AY.

**Status in one line:** a working app, running locally, shown with sample data. **No customers, users, pilots, partners or revenue yet.** Accuracy on real photos hasn't been measured. Prices and costs below are hypotheses.

## 1. One-sentence pitch

BarangAI turns a resident's photo into a report that staff verify, answer and count, so a barangay can show what it did about every concern, with AI doing the paperwork and people making every decision.

## 2. Positioning statement

For barangay offices and the leaders above them, who need to show what happened to residents' concerns, BarangAI is an AI-assisted issue desk that logs, answers and counts every report. Unlike Facebook pages, hotlines and general barangay records systems, it follows one report from a resident's phone to a monthly record, in English and Filipino, and keeps every decision with staff.

## 3. Problem and target users

**The problem:** a resident sees a flooded street or an exposed wire and tells the barangay, through a post, a text or a visit. Then what? Without a shared record, it's hard for the resident to know what happened, and hard for officials to show what was done.

| Who | What they need |
| --- | --- |
| **Residents** | An easy way to report, and an answer |
| **Barangay staff** | One queue instead of scattered messages, and less typing |
| **Captains and councils** | A record for meetings and reporting upward |
| **City leaders** | The same numbers across barangays |

**Why it matters:**
- The Philippines has 42,011 barangays, per DILG. [Source](https://calabarzon.dilg.gov.ph/dilg-pushes-full-digital-shift-in-barangays-through-nationwide-lguss-bims-adoption/)
- A 2019 audit of the national 8888 hotline counted over 792,000 abandoned calls. It's an old figure from a different service, showing the strain on public channels, not a measure of barangays. [Source](https://newsinfo.inquirer.net/1345454/8888-hotline-exceeded-target-calls-received-by-269-but-abandoned-over-792000-callers)
- In field experiments in Kampala, staff responsiveness raised reporting among long-active reporters, while recognition didn't. It's another country's evidence, but it's why we lead with answers. [Source](https://www.cambridge.org/core/journals/british-journal-of-political-science/article/escaping-the-disengagement-dilemma-two-field-experiments-on-motivating-citizens-to-report-on-public-services/18314789FA75DD9E632CDD5F2D4FD429)

*We haven't yet interviewed barangay officials, so how much this hurts them is still a hypothesis.*

## 4. Solution and benefits

1. **Logged:** a resident takes one photo. AI suggests the category, drafts a description, and blurs the faces and plates it finds before anything is saved. The resident checks and sends.
2. **Answered:** staff verify it, choose the category and explain each status change. An open app shows the resident the update in about 5 seconds.
3. **Counted:** each month, the barangay gets a printable record. Administrators see barangays side by side.

## 5. Product highlights

All of these work today in the local app, with automated tests, on sample data.

| Highlight | What it does | Limit to state |
| --- | --- | --- |
| **AI-assisted report** | Category, description and hazard flags from one photo; a separate on-device check as a cross-check and fallback | Accuracy unmeasured on real photos |
| **Privacy before storage** | Blurs faces and plates, strips metadata, and refuses photos if blurring can't run | Best-effort; can miss some |
| **People in charge** | Resident, AI and staff categories stay separate; staff verify all; nothing is sent to outside offices automatically | |
| **Closing the loop** | Status path, staff notes, what happens next, duplicate comparison | Updates by checking every few seconds while open |
| **Monthly report and rollup** | Counts, typical times, comparison with last month, CSV and print; no resident identities in exports | Figures in demos are sample data |

Also built: Filipino screens, a community map with what each barangay fixed, resident points and rewards, staff account management, backup and restore, and hands-free reporting from Rokid Glasses (built from Rokid's kit, **not yet run on real glasses**).

## 6. Differentiation and alternatives

| Alternative | What it offers | Why consider BarangAI alongside it |
| --- | --- | --- |
| **Facebook pages, walk-ins** | Free and familiar | No status trail or monthly record |
| **BIMS (DILG)** | Free barangay records system, reportedly mandated; 9,774 of 42,011 active in Dec 2025 | Sources we found don't mention an incident module. **To confirm with a real user.** Position alongside it, not against it |
| **City apps** (QC iReport; Carmona's app next to Dasmariñas) | City-wide reporting | Show that cities value this, and could also compete with us |
| **eGov PH eReport, 8888** | National channels | Different focus and level |
| **HOA community apps** (Citadel, Qmunidad) | Dues and gate tools with incident reporting | For subdivisions, not barangays |

**What's different:** the whole loop in one product, boundaries for all 75 Dasmariñas barangays loaded, Filipino throughout, privacy built in, and AI that only assists. This is our own comparison, based on public pages.

## 7. Business model (hypotheses)

- **Residents never pay.** Barangay offices pay a yearly subscription; cities could later fund many barangays at once.
- **Test prices:** ₱1,500, ₱3,000 and ₱5,000 a month. All are below the ₱100,000 barangay small-value procurement cap in RA 12009's rules. [Source](https://www.gppb.gov.ph/wp-content/uploads/2026/05/IRR-of-RA-12009-1st-Edition.pdf) **No one has agreed to any price.**
- **Costs:** AI is small: about 5 Cloudflare neurons a photo in one 28 October test, with 10,000 free a day. People are the real cost.
- **Scenario, not forecast:** with ₱30,000 monthly fixed cost and ₱950 per barangay in support and hosting (our assumptions), break-even is about 15 barangays at ₱3,000.
- **No resident data or ads will be sold.**

## 8. Status and validation

**True today:**
- Working app on a local laptop, for residents, staff and administrators.
- 499 API tests and 232 web tests pass, and a real-browser journey from report to deletion passes (5 Nov 2026).

**Not done:**
- No customers, users, pilots, interviews or revenue.
- AI accuracy on real photos isn't measured.
- Not deployed. Residents must be on the same Wi-Fi as the laptop, so **a real pilot needs hosting first**.
- Not yet tried on Android devices since the latest changes.
- No legal review yet of data privacy or rewards using public funds.
- Filipino text hasn't had a human review.
- One AI component (MobileCLIP2) has a research-only licence and must be replaced before paid use.

## 9. Next milestones and the ask

**Milestones:**
1. Interview ten barangay officials and test prices.
2. Get legal advice on privacy and rewards; replace the research-licensed component.
3. Measure AI accuracy on real, labelled photos, and publish how it was measured.
4. Host it, then run one real pilot in a Dasmariñas barangay.

**The ask for this room:**
- **Officials:** introduce us to one barangay or city office willing to pilot and tell us what they'd need.
- **Executives:** guidance on privacy, procurement and responsible AI from people who've done it.
- **Everyone:** tell us where this falls short.

We aren't announcing a funding round. If the owner wants to raise, add the amount here once it's been decided.

## 10. Spoken pitch

About 300 words, roughly **2 minutes 10 seconds** at 140 words a minute. Not timed in a read-through yet.

> A flooded street. An exposed wire. A resident tells the barangay. Then what?
>
> Today that concern might be a Facebook post, a text or a visit. It's hard for the resident to know what happened, and hard for an official to show what was done.
>
> BarangAI closes that loop. I'm going to show you the working app, with sample data.
>
> A resident takes one photo. AI suggests the category, drafts the description, and blurs the faces and plates it finds, before anything is saved. It can miss some, so the resident checks everything before sending.
>
> Then people take over. Barangay staff verify every report and explain every decision. The AI's suggestion, the resident's choice and the staff's verdict are kept separate, and nothing goes to an outside office automatically. On an open screen, the resident sees the answer within seconds.
>
> And then it adds up. Each month, the barangay gets a record it can print: what came in, what was fixed, how long it took. Across barangays, leaders see the same numbers, side by side.
>
> At a forum about AI, I want to be exact about what ours does. It does the paperwork. It doesn't decide. We haven't yet measured its accuracy on real photos, and we'll publish it when we do.
>
> Where are we? The app works and is well tested, on a laptop. We have no customers yet. Next: we talk to ten barangay officials, get legal advice, measure the AI, and run one real pilot. Our working model is simple: residents never pay, and barangay offices subscribe. We still have to prove someone will pay.
>
> There are over forty-two thousand barangays in the Philippines. We'd like to start with one.
>
> If you can introduce us to a barangay or city office willing to try it, please talk to us. Salamat.

**Shorter version (about 45 seconds):** use the first line, then the "A resident takes one photo" paragraph, "It does the paperwork. It doesn't decide.", "We have no customers yet", and the closing ask.

## 11. Slide outline

Keep the slides visual. Use real app screenshots, the existing theme (white background, Nunito, green `#58cc02`, blue `#1cb0f6`) and Kap. Put "Sample data" on every screenshot that shows figures.

| # | Title | Key message | Supporting points | Visual |
| --- | --- | --- | --- | --- |
| 1 | Then what? | A concern needs an answer and a record | Flooded street, resident, no trail | Flood photo with Kap |
| 2 | Every concern logged, answered, counted | One product, one loop | Three words, three screens | Three app screenshots |
| 3 | Logged: AI does the paperwork | One photo becomes a draft report | Category, description, blur, resident checks | Photo step with "Kap blurred 1 face" |
| 4 | Answered: people decide | AI assists; staff are accountable | Separate fields, required notes, no auto-forwarding | Staff report view, resident's status card |
| 5 | Counted: a record leaders can use | From cases to numbers | Monthly report, comparison, rollup | Rollup table (Sample data) |
| 6 | What's true today | Working, and honest about what isn't done | Tests pass; no customers; accuracy unmeasured; local only | Two columns: Works / Not yet |
| 7 | How it becomes a business | Residents free, offices subscribe | Test prices, procurement cap, cost driver: people | Simple price table, labelled "hypothesis" |
| 8 | Help us start with one | A pilot is the next step | Four milestones, the ask | Kap and contact details |

---

**Terms to use consistently:** "logged, answered, counted"; "AI assists, people decide"; "working app with sample data"; "blurs the faces and plates it finds"; "pilot partners". **Avoid:** real-time, instant, accurate, secure, compliant, proven, saves time.
