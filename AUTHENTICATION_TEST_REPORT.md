# Authentication Test Report — Quick Chat

**Date:** 3 Nov 2026
**Production:** https://quickchat.akarikatechnologies.me (deployment `dpl_2N3cKEDSrhAm3DYkSdKTLLBCdsz8`, commit `496582f`)

**Labels:**
- **PASS:** actually tested and working.
- **FAIL:** tested and failing.
- **NOT TESTED:** not verified.
- **BLOCKED:** needs credentials or infrastructure that wasn't available.

## How it was tested

**Automated, against a local build.** Real Playwright browser sessions ran against a production build (`next build` + `next start`) on the local Supabase stack (same migrations, same auth server). Tests create real users with the service-role key and sign in through the real forms. Suites:
- `tests/auth/login.spec.ts`
- `tests/auth/logout.spec.ts`
- `tests/auth/session-persistence.spec.ts`
- `tests/auth/session-expiry.spec.ts`
- `tests/auth/google-oauth.spec.ts`

**Automated, against production.** The same Google, callback, PWA and smoke suites, with `E2E_BASE_URL=https://quickchat.akarikatechnologies.me`. Suites that create users are skipped there, because the production service-role key isn't available to the test runner, which is correct.

## Results

| Scenario | Result | Evidence |
|---|---|---|
| Email login, lands in app with profile | PASS | login.spec (all browser projects) |
| Wrong password → error, stays on login | PASS | login.spec |
| Protected page → login → back to requested page | PASS | login.spec |
| Signed-in user visiting /login goes to /home | PASS | login.spec |
| Exactly one password request per sign-in | PASS | login.spec |
| Not-onboarded account → /onboarding | PASS | login.spec |
| Logout clears auth cookies | PASS | logout.spec |
| Logout revokes the refresh token on the server | PASS | logout.spec (old refresh token rejected) |
| Back after logout shows the sign-in form, not the account | PASS | logout.spec |
| Logout on one device keeps other devices signed in | PASS | logout.spec |
| Other tabs follow the sign-out | PASS | logout.spec |
| Repeated login/logout (3 cycles) | PASS | logout.spec |
| Reload keeps the session | PASS | session-persistence.spec |
| Browser restart with Remember me keeps the session (30-day cookie) | PASS | session-persistence.spec |
| Remember me off → browser-session cookie | PASS | session-persistence.spec (was FAIL before fix B6) |
| Cookies SameSite=Lax; Secure on HTTPS | PASS | session-persistence.spec; production headers |
| Invalid/expired session → /login?next=…, no loop | PASS | session-expiry.spec |
| Suspended account → /suspended | PASS | session-expiry.spec |
| Account deleted server-side → profile no longer shown | PASS | session-expiry.spec |
| Google: one PKCE flow, correct `redirect_to`, verifier cookie stored | PASS | google-oauth.spec (local and **production**) |
| Google: account chooser on every sign-in (`prompt=select_account`) | PASS | **production**, Chrome |
| Google: button reaches accounts.google.com | PASS | **production** — Chromium, WebKit, iPhone emulation |
| Google: callback without code / provider error / missing verifier explains itself | PASS | **production** |
| Google: Back from Google re-enables the button | PASS | **production** (8 of 9 repeats; the other failed on a network timeout before the page loaded) |
| Google: duplicate callback while signed in continues into the app | PASS | local |
| vercel.app address redirects to the canonical domain (prevents verifier mismatch) | PASS | **production**: `308 → https://quickchat.akarikatechnologies.me` |
| Google: completing sign-in with a real Google account | **NOT TESTED** | Needs a human Google account (procedure below) |
| Unverified email cannot sign in | **NOT TESTED** | The local stack auto-confirms emails; production requires confirmation |
| Forgot / reset password email | **NOT TESTED** | Needs a real inbox |
| Signed-in suites against production | **BLOCKED** | Needs the production service-role key in the test runner (`E2E_SUPABASE_SERVICE_ROLE_KEY`) |

## Manual Google sign-in procedure (do once per browser)

1. Open https://quickchat.akarikatechnologies.me/login in a fresh **private window**.
2. Tap **Continue with Google**, then choose an account.
3. **Expected:** you return to `/home`, or `/onboarding` for a new account, on the first try.
4. Reload: you stay signed in.
5. Open the account menu → **Sign out**: you land on `/login`.
6. Press Back: you see the sign-in form, not your account.
7. Sign in with Google again: it works on the first try.

Repeat in Safari on iPhone, Safari on Mac, Chrome and Brave. If it fails, the login page shows the reason, and the matching Supabase Auth log entry explains it.

## Known limitations

- **Revoked sessions:** a signed-out or revoked access token stays cryptographically valid until it expires (Supabase default: 1 hour). The refresh token is revoked immediately, so the session can't be extended.
- **iPhone Home Screen app:** it keeps its own cookies, separate from Safari, so users sign in once inside the installed app.
- **Private browsing:** sign-in works in Safari Private Browsing, but the session ends when the private window closes.
