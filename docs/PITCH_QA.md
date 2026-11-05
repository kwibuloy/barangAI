# BarangAI: backup Q&A

The forum has no Q&A slot. Use these for hallway conversations and follow-ups. They go with [PITCH_CONTENTS.md](PITCH_CONTENTS.md). Written 5 November 2026. Business figures are hypotheses, and legal points are questions for counsel, not advice.

## The AI

**How accurate is it?**
We don't know yet, and we won't guess. We've only tested it in limited ways, and no accuracy has been measured on real barangay photos. We have a tool to measure it on labelled photos, and that's a milestone before any pilot.

**What model do you use?**
Cloudflare Workers AI, running Mistral Small 3.1, reads the cleaned photo and suggests a category, description and hazard flags. A small on-device model cross-checks the category and stands in if Cloudflare is down. It also powers duplicate suggestions.

**What if the AI is wrong?**
It's a suggestion. The resident can change everything before sending and must tick that they checked AI-filled values. Staff then verify every report. The resident's category, the AI's and the verified one are stored separately.

**Does AI ever decide or send anything by itself?**
No. Every status change is made by staff with a written description. Nothing is automatically forwarded to outside offices. Staff see a suggested priority with its reasons, but it never reorders the queue unless they choose that.

**Is the licensing clean?**
Not yet. MobileCLIP2-S0, the on-device model, has a research-only licence, so it has to be replaced before any paid use. The face and plate models are MIT and Apache 2.0.

## Privacy and security

**How do you protect people in photos?**
Faces and plates are blurred before storage and before Cloudflare sees the photo, and metadata is removed. If blurring can't run, the photo is refused. It's best-effort: it can miss side-on or small faces, and it's been tuned on drawn plates, not real ones. Residents are also asked to keep faces and plates out.

**Where does the data go?**
Today it stays on one laptop, except cleaned photos and chat text sent to Cloudflare when AI is on, and rounded pin locations sent to OpenStreetMap for street names. The privacy page says so.

**Are you Data Privacy Act compliant?**
We don't claim that. We've built in protections like blurring, deletion, data export, role limits and a privacy notice, but counsel hasn't reviewed it. Who the controller is and NPC registration are open questions.

**Is it secure?**
We've audited all 48 API routes for access rules, with no holes found at that point, and added lockouts and account disabling. But it isn't ready for real data: traffic on the local Wi-Fi is plain HTTP, and there's been no outside security test or certification.

**Can residents delete their data?**
Yes. They can delete their account and download their data, and staff decide deletion requests for individual reports. Backups need a retention rule, which is still to be set.

## Product and status

**Is this live? How many people use it?**
No, and nobody yet. It runs locally on a laptop, residents must be on the same Wi-Fi, and we've used only sample data. The tests are real, but they aren't real-world use.

**Are the numbers in the demo real?**
No. The app really calculates them, but from sample reports we generated. The improving trend is written into that sample data on purpose.

**How long to pilot?**
We haven't set a date. It depends on hosting, legal advice, and finding a willing barangay.

**How does this fit with BIMS or eGov?**
We see BarangAI working alongside them, not replacing them. Sources we found on BIMS don't mention an incident module, but we need to confirm that with a real user. eGov's eReport covers crime, fire and emergencies. For emergencies, residents should call 911.

**Why would people use it instead of Facebook?**
That's one of our biggest unknowns. The bet is that a clear answer brings them back, and field research elsewhere supports the role of responsiveness. If they don't, we'd need a way to take in Facebook or Messenger reports.

## Business

**Who pays, and how much?**
We think barangay offices, at ₱1,500 to ₱5,000 a month, with cities later. These are test prices; no one has agreed to pay.

**Can a barangay legally buy this?**
Small-value procurement for barangays goes up to ₱100,000 under RA 12009's rules. Which fund could pay for software, and whether a free pilot is allowed, are open questions we'd take to the GPPB or a legal officer.

**What are the unit economics?**
Scenario only: with ₱30,000 a month in fixed costs and ₱950 per barangay in support and hosting, both assumptions, break-even is about 55 barangays at ₱1,500, 15 at ₱3,000, and 8 at ₱5,000. At high support costs, ₱1,500 loses money. AI cost is minor; people are the main cost.

**Why not sell to HOAs first?**
They can buy faster, but at about ₱2,400 a month for 200 households at a competitor's rate, and competitors bundle it. We plan a few calls to test it.

**Won't a free government app beat you?**
It could. That's a main risk. Our response is to talk to officials early and find out what they'd actually use before building more.

**Do the rewards use public money?**
They might, and that's a legal risk we haven't resolved. The Local Government Code limits public money for private purposes, and COA has questioned similar spending. We'd take advice first, and may sell without them. No money moves through the app.

**Are you raising money?**
We aren't announcing a round. Right now the ask is an introduction to one willing office.

## Sources

Market, legal and pricing sources are listed in [business-model.md](business-model.md).
