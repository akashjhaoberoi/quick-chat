# Deployment Report — Quick Chat

## Update 4 Nov 2026 — commit `a5ee74a`

**GitHub and Vercel:**
- `main` = `a5ee74a`.
- The Vercel production deployment is **READY**.

**Live checks after the deployment:**
- `/api/health` reports the site and database ok, and `payments: false` (no Razorpay keys yet).
- The login page loads.
- `/premium` and `/settings/premium` redirect signed-out visitors to sign-in.
- The webhook returns 503 until Razorpay is configured.

**Owner steps to finish:**
1. **Supabase → SQL Editor:** run `quick-chat-premium-update.sql` (Premium tables + "Until I stop" location). It only adds. Until it runs, Premium stays hidden or off and "Until I stop" shows an error; everything else works.
2. **Vercel environment variables:** add `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` and `RAZORPAY_WEBHOOK_SECRET` (test keys first), then redeploy.
3. **Razorpay:** add the webhook `https://quickchat.akarikatechnologies.me/api/premium/webhook` (events listed in PAYMENT_INTEGRATION_REPORT.md) and enable Subscriptions.
4. **Tax wording:** confirm the pricing page wording ("include all applicable taxes").

---


**Date:** 3 Nov 2026

## What is deployed

| Item | Value | Verified |
|---|---|---|
| Repository | github.com/akashjhaoberoi/quick-chat, branch `main` | `496582f` pushed |
| Hosting | Vercel project `quick-chat` (Hobby), functions in `bom1` (Mumbai) | deployment `dpl_2N3cKEDSrhAm3DYkSdKTLLBCdsz8` **READY**; `x-vercel-id: bom1::bom1` |
| Main domain | https://quickchat.akarikatechnologies.me | HTTPS 200, HSTS (2 years, preload) |
| DNS | Cloudflare → Vercel | resolves; Vercel domain verified |
| Secondary address | quick-chat-xi-sand.vercel.app | 308 redirect to the main domain |
| Database / Auth | Supabase project `tcszexnghusdumzgudak` (Mumbai) | `/api/health` → database ok, 15–39 ms (was 667–1,352 ms from `iad1`) |
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
