# BarangAI presentation runbook

Use synthetic resident identities and staged, non-identifying incident photos. This runbook is a demo script; it is not evidence that the steps have passed on a public deployment.

The reviewed v3 model is experimental: both held-out fallen-tree photos were misclassified as flooding. The local 0.8 confidence cutoff is a demo guard, not a calibrated reliability claim. Manual choice and staff verification remain required.

## Before the presentation

- Start the local AI presentation with `deploy/start-local.ps1` after following the README setup. Use `-Port 8001` if port 8000 is occupied. The launcher serves both the built website and API. Log in as the synthetic resident and separately as staff or administrator. Provision personnel through the existing operator command; do not put credentials in slides or source control.
- Prepare a JPG/PNG/WebP photo up to 25 MB (the app shrinks it before upload), with no identifiable people, plate numbers, or private address details. Test it through **Choose photo** and verify filename and preview.
- On the actual phone, test **Take photo**, camera permission, and **Choose photo** from the gallery. Camera capture is a browser/device hint; desktop browsers may open a file chooser instead. HEIC is unsupported and displays conversion/format guidance.
- For a phone demonstration use a reachable trusted HTTPS origin. A phone's localhost refers to the phone. Plain HTTP over the computer's LAN address does not provide a secure GPS context and production secure cookies will not work there. Retain manual coordinates/map pin as the location fallback. Do not disable production cookie security for a public demonstration.
- Confirm map tiles/network, login, private photo access, and responsive layout on the actual presentation device. Keep a local desktop demonstration available if the network fails.
- When no reviewed model is configured, explicitly explain the **AI classification unavailable** message and use manual category selection. Do not claim classification accuracy or label an untrained model as working AI. Duplicate suggestions likewise require validated embeddings.
- Google sign-in appears only when configured. Use email/password if provider credentials are unavailable. Chat remains available through its deterministic guidance/status path when its LLM provider is unavailable.

## Five-minute demonstration

| Step | Presenter action | What the audience should observe |
| --- | --- | --- |
| 1. Resident | Sign in; switch between English and Filipino. | Resident controls and labels use the selected interface language. |
| 2. Photo | Choose a prepared photo, then demonstrate Take photo on a supported phone. | Selected filename and preview; clear errors for unsupported/oversized files. |
| 3. Location/category | Use GPS or select a map pin; review AI suggestion if configured, or choose category manually. Add a short description and submit. | Pending report with separate model, resident, and verified categories. |
| 4. Staff | Sign in separately; filter the overview/map and open the new report. Start verification, choose verified category, accept, record an action or coordination note. | Actor/time history; no automatic forwarding to outside offices. |
| 5. Progress | Mark In Progress, then Resolved. | Only permitted transitions; action history remains. |
| 6. Resident tracking | Refresh/focus the resident window, open notification and mark read; view history; select the report in chat. | Status matches the API, notification read state persists, Filipino status is localized. |
| 7. Roles/privacy | Explain that administrator accounts use the barangay desk. Try accessing another synthetic resident's report in a second resident session. | Resident access is denied; staff/administrator can manage reports. |

If validated embeddings exist, also generate duplicate suggestions and confirm/reject one; show that originals remain. Otherwise show the explicit unavailable state and describe the remaining dataset/model evaluation requirement.

## Record actual evidence

Use the dated evidence row in [evaluation.md](evaluation.md). Record device/browser, build, origin, outcome and screenshot path. Distinguish automated browser emulation from a physical-phone test. A successful local demo does not prove deployed HTTPS, live Google OAuth, a trained model, or target-host model performance. Report these separately when unavailable.
