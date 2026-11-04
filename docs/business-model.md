# Business model (working hypothesis)

Drafted 4 November 2026. **No customer, barangay official or resident has been interviewed, and there is no revenue.** Prices and forecasts below are hypotheses to test. Claims about law are flags for qualified counsel, not legal conclusions. Tags: **[V]** official or primary page read, **[P]** secondary source only, **[A]** our assumption.

## Recommendation in short

Sell an **issue desk and monthly record to barangay offices**, starting with a few Dasmariñas barangays, at a test price of **₱1,500 to ₱5,000 a month** billed yearly. Don't lead with AI or points. Lead with: every resident concern logged, answered and countable for the barangay's records. Treat HOAs as a cheap parallel test, and the city as the expansion customer once barangays show evidence.

## Users and payers

| | Uses it | Could pay | Wants |
| --- | --- | --- | --- |
| Residents | Yes | No: must stay free | To be heard, and to see something happen |
| Barangay staff | Daily | Influences | Less chasing, and records that answer "what did we do?" |
| Captain and council | Occasionally | **Decides** | Visible responsiveness; a clean record for meetings and audits |
| City government | Rollup | Could fund all 75 | Oversight across barangays |
| HOAs and property managers | If adapted | Yes | Dues-funded upkeep and complaint tracking |

The problem worth paying for (hypothesis): a barangay gets complaints through Facebook, walk-ins and texts, and can't show what happened to them. Residents give up, because nothing visibly comes back.

## Alternatives

- **Facebook pages and walk-ins** are the real competitor: free and already used. No share data found.
- **BIMS (DILG):** a circular reportedly requires all barangays to adopt it, and it's free; 9,774 of 42,011 were active in December 2025 [V/P]. No incident or complaint module was mentioned, so position BarangAI as *alongside* BIMS, not instead of it. This needs checking with a real user.
- **City apps:** QC iReport [V], and Carmona's SOS BML next door, launched August 2026 [P]. They show cities will buy or build, and could crowd us out.
- **eGov PH eReport and 8888:** national; eReport covers crime, fire and emergencies [P]. 8888's 2019 audit counted over 792,000 abandoned calls [P].
- **Community apps for HOAs:** Citadel at ₱8 to ₱12 per household a month, including incident reporting [V, vendor's claim]; Qmunidad at ₱999 a village a month [P].

Why switch (hypothesis): Filipino-first, photo in a few taps, barangay boundaries already loaded, privacy built in, a monthly report ready for meetings.

## Revenue models

| Model | For | Against | Verdict |
| --- | --- | --- | --- |
| Barangay subscription | Small purchase route; the actual user pays | 75 separate sales; budget unproven | **Start here** |
| City licence | One contract covers many; up to ₱2M small-value ceiling by income class [V, table extraction was messy, re-check] | Long cycle; may build its own | Expansion |
| HOA or property manager SaaS | No public procurement; fast | ₱2,400 a month for 200 households at Citadel's rate; bundled incumbents | Parallel test only |
| Sponsored rewards | Could fund points without public money | No evidence; conflict-of-interest questions | Later |
| Selling data, or ads | | Breaks trust and the privacy promise | **No** |

## Pricing hypothesis

Barangay small-value procurement tops out at ₱100,000, and under ₱200,000 needs no PhilGEPS posting, with one quotation enough to proceed (IRR of RA 12009, Sec. 34) [V]. Every test price below sits under that ceiling. Average national tax allotment works out to about ₱5.7M per barangay (₱1.19T × 20% ÷ 42,011, our arithmetic, heavily skewed by population) [P]; one sample budget is ₱3.95M [P]. Whether a particular fund can pay for software was **not found**.

| Package (test) | Monthly | Yearly | Includes |
| --- | --- | --- | --- |
| Starter | ₱1,500 | ₱18,000 | Issue desk, monthly report, staff accounts |
| Standard | ₱3,000 | ₱36,000 | Plus onboarding session and priority support |
| Plus | ₱5,000 | ₱60,000 | Plus printed quarterly summary and training for new staff |

Rich-country anchors don't transfer: SeeClickFix about US$12,000 to US$35,000 a year [P]; FixMyStreet Pro £15,000 to £56,000, and £5,000 to £7,000 for districts [P]. No Philippine price for this kind of software was found.

**Test:** show a printed report and ask for a letter of intent at one price per conversation. "Sounds nice" doesn't count; a signed letter or a budget line does.

## Costs

| Cost | Figure | Status |
| --- | --- | --- |
| Vision AI per photo | About 5 neurons (team's local test, 28 October, once) | Measured once; re-measure |
| Workers AI | 10,000 neurons free a day, then US$0.011 per 1,000 [V] | So about 2,000 photos a day free, and about US$0.00006 each beyond that |
| Photo storage | About 200 to 500 KB a report (estimate in `media.py`) | 1,000 reports is about 0.2 to 0.5 GB |
| Server, when hosted | Hetzner from €5.99 a month before VAT [V]; Singapore price not shown | ₱400 to ₱1,500 a month with backups [A] |
| SMS, if added | ₱0.56 before VAT a text [V] | Optional; not built |
| Onboarding | 8 to 16 hours once per barangay [A] | Unmeasured: this and support are the real costs |
| Support | 2 to 6 hours a month per barangay at ₱150 to ₱300 an hour [A] | ₱300 to ₱1,800 a month |
| Legal | Counsel fee not researched | Needed before real data |
| Team | ₱30,000 a month fixed, used as a planning figure [A] | Replace with real figures |

**AI isn't the main cost. People are.** Reducing onboarding and support (P1, P13) matters more to margins than any model choice.

## Unit economics (scenarios, not forecasts)

Fixed ₱30,000 a month [A]. Variable ₱950 per barangay a month: mid support ₱900 plus ₱50 of infrastructure [A].

| Price a month | Contribution per barangay | Barangays to break even |
| --- | --- | --- |
| ₱1,500 | ₱550 | 55 |
| ₱3,000 | ₱2,050 | 15 |
| ₱5,000 | ₱4,050 | 8 |

At the high support estimate (₱1,800), ₱1,500 a month **loses money on every barangay**, so Starter works only if onboarding becomes nearly self-service. Dasmariñas alone has 75 barangays, so ₱3,000 needs about one in five of them.

## Getting customers

1. **Timing:** barangay elections were set for 2 November 2026, with winners reportedly taking office on 1 December (one source; outcome not checked) [P]. New officials may want to show responsiveness early. Confirm this first.
2. **First conversations:** Dasmariñas secretaries and captains, in person, with a printed sample report made from synthetic data.
3. **Proof spreads between barangays:** one working barangay, then its neighbours and the city's barangay affairs office.
4. **Low-cost supporting channels:** a one-page Filipino brochure; a talk at a Liga ng mga Barangay chapter meeting, if one will have us [A].

Avoid paid ads: the buyer is a few hundred identifiable people.

## Keeping customers

- Evidence points to **staff responsiveness** as what keeps residents reporting. Field experiments in Kampala found that responses raised reporting among long-active reporters, while recognition didn't; an airtime lottery wasn't separately testable [V]. A good first experience goes with a 57% higher chance of a second report (FixMyStreet, 399,364 users, association only) [P].
- So a resident's first report must get a real answer. Points are unproven: no controlled test of points or cash in civic reporting was found.
- Officials change, so a barangay's records must outlast its staff. That needs staff handover (P1, B6).

## What we measure

Computed from our own database, with no third-party analytics (M3). Not yet built, so none of these has a value.

| Stage | Metric |
| --- | --- |
| Staff activation | First status change within 48 hours of the first report |
| Resident activation | First report within 7 days of signing up |
| Follow-through (north star) | Share of reports with a staff response within 7 days; median time to accept and resolve |
| Resident retention | Second report within 60 days |
| Barangay retention | Staff active each week; monthly report used each month |
| Business | Conversations, letters of intent, paid barangays, support hours per barangay |

## Riskiest assumptions

| # | Assumption | Cheap test | Changes the plan if |
| --- | --- | --- | --- |
| 1 | Barangays have budget and will to pay | 10 interviews, then letters of intent | Nobody signs after 10: try the city or HOAs |
| 2 | Free BIMS doesn't already do this | Ask a BIMS user; see it | It does: stop competing, or integrate |
| 3 | Staff will respond day to day | One-barangay pilot on synthetic data | Queue goes stale: fix the workflow before selling |
| 4 | Residents will use it, not Facebook | Pilot, after B2 and F1 | They don't: add a Facebook or Messenger intake path |
| 5 | Selling to officials is legally clean | GPPB or legal opinion | Free pilots are unsafe: start with a paid low price |
| 6 | Rewards are allowed | Counsel on COA and Local Government Code issues | Not allowed: drop public-funded rewards |

## Legal and procurement flags (for counsel)

- **MobileCLIP2 licence:** "exclusively for Research Purposes", defined to exclude commercial products [V]. On our reading this blocks paid use, and maybe development. Fix before any sale (B1).
- **Rewards and public funds:** Local Government Code Sec. 335 and *Albon v. Fernando* bar local public money for private purposes; COA has disallowed barangay incentives and questioned prizes [P]. No ruling on points was found.
- **Data privacy:** NPC Circular 2022-04 on registering systems, controller and processor roles, CCTV Circular 2024-02 possibly applying to public-space photos [P]. Note the app doesn't yet name an operator or contact until `OPERATOR_NAME` and `PRIVACY_CONTACT` are set.
- **Procurement traps:** under RA 12009's IRR, Sec. 37 commissioned goods give the buyer the IP unless a written agreement says otherwise [V]; Sec. 35.13 direct online subscriptions apply "where no local provider" exists, so may not fit us [V]; no clear rule on free pilots was found, and RA 3019 has been raised about free services to officials [P].

## How this drives the product

| Needed to... | Capability | Status |
| --- | --- | --- |
| Deliver value | Issue desk, status path, monthly report | Built; report awaiting screenshot approval |
| Earn trust | Records that survive laptop loss, blur that can't silently fail | Built |
| Start a pilot | Self-service barangay setup; hosting or send-later | Not built (P1, F1) |
| Be sellable | Licensed checker; counsel review; operator details | Not done (B1, B2) |
| Keep customers | Next-step clarity, faster triage, staff handover | Not built (P5, P8, B6) |

**Billing isn't built and shouldn't be until someone agrees to pay.** A signed letter and an official receipt are enough for the first customers.

## Sources

[IRR of RA 12009](https://www.gppb.gov.ph/wp-content/uploads/2026/05/IRR-of-RA-12009-1st-Edition.pdf) · [DBM LBM 77-A](https://dbm.gov.ph/wp-content/uploads/Issuances/2018/Local%20Budget%20Memorandum/LOCAL-BUDGET-MEMORANDUM-NO-77-A.pdf) · [DILG Calabarzon on 2026 NTA](https://calabarzon.dilg.gov.ph/dilg-urges-prudent-utilization-of-2026-nta-shares-of-lgus/) · [DBM on barangay NTA share](https://www.dbm.gov.ph/wp-content/uploads/2012/03/BB-2.pdf) · [Batac sample budget](https://sp1.batac.gov.ph/document/show/9280) · [DILG on BIMS](https://calabarzon.dilg.gov.ph/dilg-pushes-full-digital-shift-in-barangays-through-nationwide-lguss-bims-adoption/) · [QC iReport](https://quezoncity.gov.ph/program/qc-ireport/) · [Carmona app](https://mb.com.ph/2026/08/30/carmona-launches-app-for-faster-emergency-community-concern-reporting) · [8888 audit](https://newsinfo.inquirer.net/1345454/8888-hotline-exceeded-target-calls-received-by-269-but-abandoned-over-792000-callers) · [Citadel](https://citadel-landing.pages.dev/) · [Qmunidad](https://www.capterra.com/p/10042250/Qmunidad/) · [SeeClickFix, Burleson](https://mccmeetingspublic.blob.core.usgovcloudapi.net/burlesontx-meet-5c80773b6cf64634aa0bca5b54dcf2ef/ITEM-Attachment-005-e3cbc593a1ea4de9803d512b9cb2194b.pdf) · [SeeClickFix average](https://www.news5cleveland.com/news/local-news/investigations/app-used-in-city-of-canton-puts-power-in-the-hands-of-citizens-for-reporting-and-tracking-problems) · [FixMyStreet Pro pricing](https://assets.applytosupply.digitalmarketplace.service.gov.uk/g-cloud-14/documents/586634/750036126019114-pricing-document-2026-04-29-1117.pdf) · [SocietyWorks](https://www.societyworks.org/how-to-buy/) · [Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) · [Hetzner](https://www.hetzner.com/cloud) · [Semaphore](https://www.semaphore.co) · [Nominatim policy](https://operations.osmfoundation.org/policies/nominatim/) · [MobileCLIP2 licence](https://huggingface.co/apple/MobileCLIP2-S0/blob/main/LICENSE) · [NPC registration summary](https://www.mondaq.com/privacy-protection/1319392/all-things-registration-national-privacy-commission-issues-new-rules-on-registration-of-data-processing-systems) · [NPC Circular 2024-02](https://privacy.gov.ph/wp-content/uploads/2024/08/NPC-Circular-No.-2024-02-CCTV-Systems.pdf) · [Albon v. Fernando](https://chanrobles.com/scdecisions/jurisprudence2006/jun2006/gr_148357_2006.php) · [COA, barangay incentives](https://cebudailynews.inquirer.net/?p=93883) · [Free services column](https://newswav.com/article/no-public-bidding-required-for-free-service-A2602_wYv8iE) · [Election timing](https://www.sunstar.com.ph/pampanga/barangay-sk-polls-moved-to-nov-2026) · [Kampala experiments](https://www.cambridge.org/core/journals/british-journal-of-political-science/article/escaping-the-disengagement-dilemma-two-field-experiments-on-motivating-citizens-to-report-on-public-services/18314789FA75DD9E632CDD5F2D4FD429) · [FixMyStreet second reports](https://oidp.net/en/content.php?id=1441)
