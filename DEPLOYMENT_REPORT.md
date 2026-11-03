# Deployment Report — Quick Chat

**Date:** 3 Nov 2026

## What is deployed

| Item | Value | Verified |
|---|---|---|
| Repository | github.com/akashjhaoberoi/quick-chat, branch `main` | `0ad8a9c` pushed |
| Hosting | Vercel project `quick-chat` (Hobby) | deployment `dpl_BtrhkS3hLkS1Tp3gq5AL9VGhtZsM` **READY** |
| Main domain | https://quickchat.akarikatechnologies.me | HTTPS 200, HSTS (2 years, preload) |
| DNS | Cloudflare → Vercel | resolves; Vercel domain verified |
| Secondary address | quick-chat-xi-sand.vercel.app | 308 redirect to the main domain |
| Database / Auth | Supabase project `tcszexnghusdumzgudak` (Mumbai) | `/api/health` → database ok |
| Calls | LiveKit Cloud | health: livekit true |
| Email | Resend, domain `akarikatechnologies.me` | domain verified (DKIM, SPF, MX) |
| Storage | Supabase Storage, bucket `media` (private) | health: storage supabase |
| Scheduled cleanup | Vercel Cron, daily | health: cron true |
| Push notifications | Firebase Cloud Messaging | **off**: `FIREBASE_SERVICE_ACCOUNT` not set |
| Redis | not configured | in-memory rate limiting per server instance |

## Live checks after this deployment

Run with `E2E_BASE_URL=https://quickchat.akarikatechnologies.me` in Chromium, WebKit (Safari's engine) and iPhone emulation:

- **Results:** 73 passed, 1 failed, 13 skipped.
- **The failure:** a Playwright-WebKit quirk in a test (Back from a stubbed cross-site page). Fixed in the test, then 8 of 9 repeated runs passed; the ninth failed on a network timeout before the page loaded.
- **The skips:** tests for other browsers, or tests that need a signed-in user on production.

What these cover:
- landing, legal and offline pages;
- security headers, manifest and icons;
- service worker, offline fallback;
- protected routes and APIs reject anonymous callers;
- cross-site POSTs rejected; cron secret required;
- Google hand-off to accounts.google.com;
- callback error handling.

## Environment variables (names only)

Set in Vercel for production and preview:
- `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_APP_NAME`
- Supabase keys (connected integration), `SUPABASE_STORAGE_BUCKET`
- `LIVEKIT_*`
- `NEXT_PUBLIC_FIREBASE_*`
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL`
- `CRON_SECRET`, `GIPHY_API_KEY`

Missing: `FIREBASE_SERVICE_ACCOUNT` (push), `REDIS_URL` (optional).

## Still to do (needs the owner's accounts)

1. **Push notifications:** add `FIREBASE_SERVICE_ACCOUNT` in Vercel, then redeploy.
2. **Rotate keys that appeared in chat:** LiveKit secret, Vercel token, Supabase access token, R2 token.
3. **Sign in with Google once per browser** (procedure in AUTHENTICATION_TEST_REPORT.md).
4. **Optional:** add a production test key (`E2E_SUPABASE_SERVICE_ROLE_KEY`) so the signed-in suites can run against production.
