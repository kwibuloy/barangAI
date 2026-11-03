# Optional Google resident sign-in

Google sign-in is implemented as an optional authorization-code OpenID Connect flow. Password sign-in remains available. With no valid server configuration, `/auth/google/config` returns `{"enabled": false}` and the browser hides the Google button.

## Configure a web OAuth client

1. Open [Google Auth Platform](https://console.cloud.google.com/auth/overview) under your Google Cloud project. Configure the application's branding, audience and support contact. Request only `openid` and `email`; this application does not request Drive, Gmail or other Google API access.
2. Create an OAuth client of type **Web application**. Register the exact callback URI below. For an external application in testing, add the intended demonstration accounts as test users.
3. Save these values only in the API service's secret environment settings:

```text
GOOGLE_CLIENT_ID=<web-client-id>
GOOGLE_CLIENT_SECRET=<web-client-secret>
GOOGLE_REDIRECT_URI=https://<your-render-host>/api/auth/google/callback
```

The redirect URI must match Google Console exactly, including `/api` when the public service serves its API there. HTTPS is required except for local `localhost`, `127.0.0.1` or `::1` development. A local Vite proxy can use `http://localhost:5173/api/auth/google/callback`. Keep the same hostname in the browser and callback so the state cookie is returned. Do not put the client secret in `VITE_*` variables or the frontend bundle. Run Alembic through migration `0005` before enabling the provider.

## Login behavior

The browser visits `/api/auth/google/start`. The server creates a ten-minute, one-use transaction containing random state, nonce and a PKCE verifier. The browser receives only a random, HttpOnly, SameSite=Lax state cookie (Secure on HTTPS); the verifier stays on the server. Google returns a code to the configured callback. The server checks state and exchanges the code using the verifier and client secret.

The maintained `google-auth` library verifies Google's signature, issuer, audience and token time validity. BarangAI additionally requires the nonce, a verified email, a valid subject and the correct authorized party when present. Tokens are not saved or returned to the browser. The app creates its existing session and CSRF cookies, then redirects to `/`.

A new Google subject creates a **resident** account. Existing Google identities map by provider and subject, not email. A matching local password-account email is **never automatically linked**; sign in using that account's password. This build does not provide account linking or Google password recovery. Google sign-in cannot access an identity linked to a staff or administrator account. Keep staff and administrator password sign-in for the demonstration.

Pending authorization transactions are bounded in process memory for this single-worker deployment. A process restart cancels an unfinished login safely; start again. Run one API worker. Multiple workers or instances require a shared short-lived transaction store before enabling this flow; a resident's completed app session itself stays in PostgreSQL.

## Callback messages

The callback redirects to `/` on success, or a fixed `/?auth_error=...` code on failure. It never includes upstream token errors or credential details.

| Code | Meaning |
| --- | --- |
| `google_cancelled` | The user declined Google authorization. |
| `google_invalid_state` | The browser state was missing, different, expired, or already used. Start again. |
| `google_failed` | The code exchange or token validation failed. |
| `google_email_unverified` | Google did not confirm a verified email address. |
| `google_account_exists` | A local account already uses this email. Use its password sign-in. |
| `google_resident_only` | This Google identity is not linked to a resident account. |

## Verification before presentation

Local tests use synthetic identities and mocked HTTP/certificates. They cover PKCE, state/browser binding, expiry/replay, nonce, email verification, account collision, resident restrictions, and real library validation of synthetic signatures, issuer, audience and expiration. They do not contact Google or prove a configured hosted callback works.

With the real client configured, complete one consented resident sign-in in the deployed browser and confirm `/api/auth/me` returns the resident account, logout works, and a second sign-in reuses the same resident. Also confirm cancellation, an existing password-account collision, and a browser without a pending transaction fail safely. Google credentials, consent-screen setup and this live smoke are still required.

References: [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect), [Google ID-token validation library](https://google-auth.readthedocs.io/en/latest/reference/google.oauth2.id_token.html).
