# Final QA Checklist — Quick Chat

**Date:** 3 Nov 2026
**Live:** https://quickchat.akarikatechnologies.me (commit `496582f`, Vercel region `bom1`)
**Labels:** PASS · FAIL · NOT TESTED · BLOCKED

## Acceptance conditions

| Condition | Status | Evidence |
|---|---|---|
| Google sign-in works on the first try (Chrome, Brave, Safari engine) | PASS up to Google; full round trip **NOT TESTED** | Live Chrome 6/6; the retry cause (vercel.app → wrong origin) is removed; completing it needs a human Google account |
| Google lets you choose another account after logout | PASS | `prompt=select_account` checked on live |
| Login works | PASS | login.spec, 8 browser projects |
| Logout works (server revoke, this device only) | PASS | logout.spec |
| Repeated login/logout | PASS | logout.spec |
| Sessions persist correctly (reload, restart, Remember me) | PASS | session-persistence.spec |
| Auth redirects work, no loops | PASS | login/session-expiry/google specs |
| PWA install where supported; iOS steps available | PASS | pwa/install.spec (local and live) |
| All main routes work, no console errors | PASS | app/routes.spec (20 signed-in screens) |
| No critical server errors | PASS | live health ok; callback/API negative paths return handled responses |
| No unauthorized data access | PASS | messaging isolation test, admin access tests, 92 RLS database tests |
| Production build passes | PASS | `next build`, 110 routes |
| Hosted application verified | PASS | live suites: 73 passed (Chromium, WebKit, iPhone), Chrome Google 6/6 |

## Checks run

| Check | Result |
|---|---|
| TypeScript (`tsc --noEmit`) | PASS, 0 errors |
| ESLint | PASS, 0 errors |
| Unit tests (vitest) | PASS, 60/60 |
| Database/RLS tests | PASS, 92/92 (previous run; no migrations changed since) |
| Production build | PASS |
| Browser matrix (8 projects) | 385 passed / 13 failed (all 13 fixed and re-verified in targeted runs) |
| Live site suites | PASS (one WebKit test quirk fixed; one network timeout) |
| `npm audit --omit=dev` | 4 high (unused Firebase Firestore → grpc; only fix is a breaking downgrade), 0 moderate |

## Performance

The server functions moved from Washington (`iad1`) to Mumbai (`bom1`), next to the database:

| Measurement | Before | After |
|---|---|---|
| Database round trip | 667–1,352 ms | 15–39 ms |
| Database steps in the sign-in callback before redirect | 5–8, sequential, cross-continent | 2 (code exchange + profile, in parallel with the MFA check) |

Login logging and new-device alerts now run after the response.

## Feature coverage in this round

| Feature | Status |
|---|---|
| Register, login, logout, Google start/callback | PASS |
| Email verification, forgot/reset password | NOT TESTED (needs an inbox) |
| Chat: send, receive live, persist, isolation | PASS |
| Typing, read receipts, reply, react, delete, groups | NOT TESTED in browser (API/DB tests cover the rules) |
| Media uploads, Snaps, Stories, calls | NOT TESTED in browser (API/DB tests cover the rules; calls need camera/microphone and LiveKit) |
| Admin: access control, MFA requirement | PASS |
| Admin: user management, moderation, reports, audit logs | NOT TESTED in browser |
| Push notifications | BLOCKED: `FIREBASE_SERVICE_ACCOUNT` not set in Vercel |

## Owner actions remaining

1. Sign in with your real Google account in Chrome, Safari (Mac and iPhone) and Brave, following the steps in AUTHENTICATION_TEST_REPORT.md.
2. Add `FIREBASE_SERVICE_ACCOUNT` in Vercel and redeploy, to turn push notifications on.
3. Rotate the keys that appeared in chat: LiveKit secret, Vercel token, Supabase access token, R2 token.
