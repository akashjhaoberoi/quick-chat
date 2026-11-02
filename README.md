# Quick Chat

**Connect. Chat. Share.** — a real-time social messaging platform by **Akarika Technologies**.

Quick Chat combines instant messaging, disappearing Snaps, 24-hour Stories, streaks, voice/video
calls and a short-video Discover feed, with privacy and security enforced by the database rather
than the UI.

| | |
| --- | --- |
| Frontend | Next.js 16 (App Router, Cache Components), React 19, TypeScript (strict), Tailwind CSS 4, Motion, Lucide |
| Backend | Next.js route handlers + Supabase (Postgres, Auth, Realtime, Storage) with Row Level Security and SECURITY DEFINER RPCs |
| Media | Cloudflare R2 or Supabase Storage via signed URLs |
| Calls | LiveKit (WebRTC) with server-minted, short-lived tokens |
| Push / Email | Firebase Cloud Messaging · Resend |
| Jobs | pg_cron + Vercel Cron |
| Tests | Vitest (unit), PGlite (real migrations + RLS), Playwright (E2E) |

## Quick start

```bash
npm install
cp .env.example .env.local      # fill in Supabase keys at minimum
# apply supabase/migrations/* to your Supabase project (docs/SETUP.md §1.3)
npm run dev                     # http://localhost:3000
```

Without Supabase credentials the app starts in **setup mode** (`/setup`) and explains what to configure.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build / server |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Unit + database tests |
| `npm run test:db` | Runs every migration in PGlite and verifies RLS/RPC behaviour |
| `npm run test:e2e` | Playwright (Chromium, Firefox, WebKit, Edge, Android & iOS emulation) |
| `npm run check` | Typecheck + lint + tests + build |

## Documentation

* [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — request flow, folder layout, conventions
* [docs/SETUP.md](docs/SETUP.md) — Supabase, storage, LiveKit, Firebase, Resend, Redis, first admin
* [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — Vercel + `quickchat.akarikatechnologies.in`
* [docs/API.md](docs/API.md) — REST API reference
* [docs/DATABASE.md](docs/DATABASE.md) — schema, RLS and RPC overview
* [docs/SECURITY.md](docs/SECURITY.md) — security & privacy model, launch checklist
* [docs/TESTING.md](docs/TESTING.md) — test strategy and latest results
* [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md)
* [DEVELOPMENT_STATUS.md](DEVELOPMENT_STATUS.md) — module status, bugs, readiness

## Honest limitations

* Messages are encrypted in transit and at rest, **not end-to-end encrypted**.
* Screenshot alerts are best-effort; browsers cannot reliably detect screenshots.
* Web push on iOS requires adding Quick Chat to the Home Screen; background calls are not possible
  in a browser tab that the OS has suspended.
* See [DEVELOPMENT_STATUS.md](DEVELOPMENT_STATUS.md) for the full list.

© Akarika Technologies. All rights reserved.
