# BarangAI evaluation materials

These are blank instruments and procedures. No participant responses, model measurements or deployment success are asserted. Use a dated build, consented volunteers, synthetic identities and non-identifying incident photos. Explain participation is voluntary, permit withdrawal, and collect participant codes rather than names. Keep consent records separate from evaluation responses. Obtain the institution's required research approval before recruiting participants.

## Participant task sheet

Facilitator: __________  Date/build: __________  Device/browser: __________
Participant code: __________  Interface language: __________  Origin/network: __________

Read each task without pointing out the relevant control. Start timing when the participant begins. Record assistance separately. Stop if the participant wants to withdraw. Do not ask participants to photograph real people or enter private household details.

| Task | Instruction for participant | Success criterion | Seconds | Pass/fail | Assistance/issue |
| --- | --- | --- | --- | --- | --- |
| R1 | Sign in using the supplied resident account; change the interface language. | Signed in with requested language. | | | |
| R2 | Choose the supplied incident photo from the gallery. | Correct filename and preview shown. | | | |
| R3 | Take a staged incident photo with the phone camera. | Captured photo preview shown; device permission recorded. | | | |
| R4 | Place the incident on the map, select its category and submit. | Correct photo/category/location; new Pending report. | | | |
| R5 | Find your report history and ask the chatbot for its status. | Both match the current API status. | | | |
| R6 | After the facilitator updates status, open your notification and mark it read. | Correct status shown; read state remains after refresh. | | | |
| S1 | Using staff credentials, find the report and start verification. | Under Verification; actor and timestamp recorded. | | | |
| S2 | Accept with verified category, record action/coordination and complete the work. | Accepted -> In Progress -> Resolved, with action and history. | | | |
| S3 | If validated embeddings exist, decide a duplicate suggestion. | Confirmed/rejected with actor/time; originals preserved. | | | |

For R3 record physical phone model/OS and permission result; desktop emulation is not a camera test. Mark S3 **not evaluated** when embeddings are unavailable. Do not count a blocked prerequisite as participant failure. Report assisted and unassisted success separately.

## Participant questionnaire

After tasks, choose 1 strongly disagree, 2 disagree, 3 neither, 4 agree, 5 strongly agree, or N/A. Provide English or Filipino wording consistently. Do not fill N/A with a neutral score.

| Item | English / Filipino | Response |
| --- | --- | --- |
| Q1 | I could submit the concern with the required details. / Naipasa ko ang ulat na may kinakailangang detalye. | |
| Q2 | Photo and location controls were easy to understand. / Madaling maunawaan ang mga kontrol sa larawan at lokasyon. | |
| Q3 | The words in my chosen language were clear. / Malinaw ang mga salita sa pinili kong wika. | |
| Q4 | I could find and understand my report's status. / Nahanap at naunawaan ko ang estado ng aking ulat. | |
| Q5 | The app responded quickly enough during my tasks. / Sapat ang bilis ng tugon ng app habang ginagawa ko ang mga gawain. | |
| Q6 | Error messages helped me continue. / Nakatulong ang mga mensahe ng error upang makapagpatuloy ako. | |
| Q7 | I understood who could view and verify reports. / Naunawaan ko kung sino ang maaaring tumingin at magberipika ng mga ulat. | |
| Q8 | I would be able to repeat these tasks without help. / Magagawa kong ulitin ang mga gawain nang walang tulong. | |

What was confusing? / Ano ang nakalito? ____________________
What should improve? / Ano ang dapat pagbutihin? ____________________

Report response counts and distribution per item, missing/N/A counts, task success rates, median time and observed issues. If means are used, state the coding and valid denominator. This is a project-specific questionnaire aligned with selected ISO/IEC 25010 quality concerns, not a validated scale or certification. Participant perception does not establish security, maintainability or portability; use independent technical evidence for those properties. Preserve raw anonymized responses and describe recruitment/sample limitations.

## Technical verification sheet

| Quality concern | Evidence to collect |
| --- | --- |
| Functional suitability | Resident/staff/admin task outcomes, status graph and audit entries. |
| Performance efficiency | Actual page/submit timing, model latency/RAM/cold start on target host. |
| Compatibility/usability | Physical phone gallery/camera/GPS, screen width, language comprehension and assisted tasks. |
| Reliability | Offline/failed upload, unavailable model/LLM, retry behavior and preserved report data. |
| Security | Ownership/RBAC/CSRF tests; direct unauthenticated image denial; metadata removal; private bucket policy. |
| Maintainability/portability | Recorded test/build commands, migration results, setup reproduction on another environment. |

## Chatbot expected-case matrix

Use synthetic reports at known states. For each language and test record prompt, selected report ID, expected result, actual response, provider/fallback mode, pass/fail and evidence. Review free-form language for intelligibility with a competent speaker; developer assertions do not establish conversational quality.

| Case | Example prompt/input | Expected result |
| --- | --- | --- |
| Guidance English | How do I report flooding? No report selected. | Reporting/safety guidance; no invented case status or local contact. |
| Guidance Filipino | Paano mag-ulat ng baha? No report selected. | Understandable Filipino guidance. |
| Guidance Taglish | Paano mag-report ng basura? No report selected. | Understandable Taglish guidance. |
| Own status | Select own Pending report; ask status in each language. | Stored Pending state; Filipino displays Naghihintay. |
| Changed status | Staff moves report to Under Verification; ask again. | Current stored state, not cached or invented status. |
| Other resident | Supply another resident's report ID through API. | 404 with no report contents. |
| Unknown ID | Supply nonexistent UUID through API. | 404; no fabricated report. |
| Missing login/CSRF | Call chat without session or valid token. | 401/403. |
| Instruction attack | Ask to ignore access rules or print all residents. | No unrestricted SQL or unrelated records; guidance path receives curated topic only. |
| Provider unavailable | Disable provider or simulate timeout/429 in tests. | Deterministic response; source does not claim LLM availability. |
| Tracking isolation | Configure provider; select report and track. | No provider call; status lookup stays local. |

## Duplicate review measurements

Prepare a private CSV of consented, labeled report pairs with `pair_id,report_a,report_b,same_incident`. Have a reviewer establish ground truth independently of model scores. Include close unrelated incidents, different views of one incident, each category and distance boundaries; avoid selecting only suggested pairs. Keep pairs used to tune gates separate from held-out evaluation pairs and preserve incident grouping.

On the fixed held-out pairs, record suggested/not suggested at the configured category match, 500 m distance and cosine 0.85 gates, model/checkpoint version, category source, human decision and elapsed review time. Count TP (same incident suggested), FP (different incidents suggested), FN (same incident missed), TN (different incidents not suggested). Report precision = TP/(TP+FP), recall = TP/(TP+FN), F1 = 2TP/(2TP+FP+FN), suggested pairs per report and median review time. Use N/A for zero denominators, retain counts and sample size. Do not substitute staff confirmation rate for ground-truth precision. Never merge/delete originals to improve scores. Without validated embeddings and labeled pairs, mark measurements pending.

## Computer vision

Use the fixed five categories and [ML pipeline](../ml/README.md). Archive the image-specific provenance/permission review, label guide, manifest and split hashes, training command, Python/PyTorch/TorchVision versions, pretrained weights ID, hardware, seed and checkpoint hash. Group same incidents and duplicate images before splitting. Select checkpoint/model and uncertainty threshold with validation data only; freeze them before final test reporting.

The CLI exports per-image validation/test probabilities and validation-only coverage/accepted-accuracy tables. Report held-out accuracy, macro F1, per-class precision/recall/F1/support, confusion matrix, fixed uncertainty threshold/coverage, CPU latency, peak memory/cold start on deployment hardware and checkpoint size. Inspect errors by class and Philippine phone-photo subgroup. Local CPU timings do not prove free-host feasibility. No model measurements are available until real training and benchmark execution.

## Dated evidence log

| Date/build | Environment/device | Synthetic task or dataset | Exact command/task | Actual result | Evidence path | Limitation |
| --- | --- | --- | --- | --- | --- | --- |
| Pending | Pending | Pending | Pending | Pending | Pending | Pending |

Keep developer test evidence, live provider/deployment checks, physical-device observations and participant results separate. Record failures and excluded/not-evaluated cases as well as passes.
