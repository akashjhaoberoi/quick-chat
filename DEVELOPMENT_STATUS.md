# Quick Chat — Development Status

_Last updated: 2026-11-02_

## Summary
All modules are implemented against a real database schema (10 migrations, RLS on every table) and
real `/api/*` endpoints. The project **type-checks, lints, passes 152 unit/DB tests, builds for
production and passes the 84 browser smoke tests**. It has **not yet been run against a live Supabase
project** or with live LiveKit/FCM/Resend/R2 credentials, so it is _code-complete, pending live
integration testing_ — not yet verified in production.

## Module status
| Module | Status | Notes |
| --- | --- | --- |
| Auth (email, Google, verify, reset, MFA, remember-me, sessions, deactivate/delete) | ✅ Built | Google needs enabling in Supabase |
| Onboarding, profiles, settings (6 sections), legal pages, landing, setup mode | ✅ Built | |
| Friends (requests, suggestions, lists, block, follow) | ✅ Built | |
| Chat (1:1 + groups, all message types, receipts, typing, reply/forward/edit/delete/react/pin/star, search, mute/archive, disappearing, optimistic send, live location, link previews) | ✅ Built | |
| Snaps (camera, editor, view-once, replay, server expiry, best-effort screenshot notice) | ✅ Built | |
| Stories (audiences, viewer, reactions, replies, viewers list) | ✅ Built | |
| Streaks & score | ✅ Built | Server-side rules and caps |
| Calls (LiveKit 1:1 + group, voice/video, incoming overlay, history) | ✅ Built | Disabled until LiveKit keys are set |
| Discover (feed, posts, likes, comments, saves, hashtags, creators) | ✅ Built | |
| Notifications (in-app realtime, toasts, FCM push) | ✅ Built | |
| Global search | ✅ Built | |
| Admin dashboard (overview, users, reports, appeals, content, audit, system, settings, announcements) | ✅ Built | Role-based; optional MFA requirement |
| PWA (manifest, service worker, offline page, install) | ✅ Built | |

## Verification
See [docs/TESTING.md](docs/TESTING.md). tsc 0 errors · eslint 0 · Vitest 152/152 · `next build` ✅ ·
Playwright smoke 84 passed / 6 skipped (need Supabase) across 6 browser projects.

## Before launch (required)
1. Create the Supabase project, apply `supabase/migrations/*`, set env vars (see `.env.example`, docs/SETUP.md).
2. Configure Auth redirect URLs and email templates (docs/SETUP.md).
3. Add optional services as needed: R2 or Supabase Storage (media), LiveKit (calls), Firebase (push),
   Resend (email), Upstash Redis (rate limits across instances).
4. Grant the first super admin (docs/SETUP.md).
5. Deploy to Vercel and point `quickchat.akarikatechnologies.in` at it (docs/DEPLOYMENT.md).
6. **Manual QA pass with two real accounts** across chat, snaps, stories, calls and admin.

## Known limitations (by design or platform)
* Messages are encrypted in transit and at rest, **not end-to-end encrypted**.
* Screenshot detection is **best-effort**; most OS screenshot shortcuts never reach the browser. The UI says so.
* Disappearing content is deleted by the server, but recipients can still photograph their screen.
* Web push on iOS requires adding the app to the Home Screen. A call can't ring a suspended browser tab
  unless push is enabled; leaving the call page ends your part of the call.
* Torch only works where the browser supports it (mostly Android Chrome). Videos are capped at 60 s with no trimming.
* Live location only updates while the sharer has the app open.
* Some search tabs (groups, creators, public stories) page through the first 50 results only.
* Suspend/ban blocks sign-in only when `SUPABASE_SERVICE_ROLE_KEY` is set. Without it the database
  still enforces the suspension, but an existing session keeps working until its token expires.
* New-device alerts compare the exact user-agent, so a browser update counts as a new device.

## Not done yet
* E2E journey tests against a real Supabase project (to be written on request).
* Live verification of LiveKit, FCM, Resend and R2.
* Production deployment (not performed; requires the owner's Vercel/Supabase accounts and DNS).
