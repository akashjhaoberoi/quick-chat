# Quick Chat — Testing

## Commands
| Command | What it runs |
| --- | --- |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm run lint` | ESLint over the whole repo |
| `npm run test:unit` | Vitest unit tests (`tests/unit`) |
| `npm run test:db` | Applies **every migration** to PGlite with emulated Supabase roles/`auth` schema and exercises RLS + RPCs as different users (`tests/db`) |
| `npm run test:e2e` | Playwright against `next start -p 3100` (or `E2E_BASE_URL`) |
| `npm run check` | typecheck + lint + unit/db tests + build |

## Latest results (2026-11-02, local Windows 11, Node 24, Next.js 16.4.3)
| Check | Result |
| --- | --- |
| TypeScript (`tsc --noEmit`) | **0 errors** |
| ESLint (`eslint .`) | **0 errors, 0 warnings** |
| Vitest unit + DB | **152 / 152 passed** (10 files) |
| Production build (`next build`) | **Passed** — 110 routes; static, partial-prerender and dynamic as expected |
| Playwright smoke (`tests/e2e/smoke.spec.ts`) | **84 passed, 6 skipped, 0 failed** across Chromium, Firefox, WebKit, Edge, Pixel 7, iPhone 14 |

Skipped e2e tests are the ones that only apply when Supabase **is** configured (auth pages render);
this run used no Supabase credentials, i.e. setup mode.

### What the DB suite covers
Every migration applied in order; RLS isolation (non-members can't read conversations/messages/snaps/
stories); block enforcement across messaging, friend requests, search and stories; idempotent sends;
receipts privacy; snap view windows, replay and expiry; streak/score rules and caps; story audiences;
call signalling; discover visibility; report snapshots; admin role checks and audit logging;
maintenance job cleanup; registration-closed trigger; `my_friend_requests`. A mutation check confirmed
the suite fails when a block filter is removed.

### What the smoke suite covers
Landing/legal/offline pages, small-screen overflow, security headers (CSP, nosniff, DENY, HSTS, no
`x-powered-by`), PWA manifest + icons, service worker caching rules, API envelope + `no-store`,
anonymous rejection, cross-site POST rejection, cron secret, protected app/admin routing, setup mode.

## Bugs found and fixed during this run
| Bug | Fix |
| --- | --- |
| `/admin` crashed the production build (Supabase client created during prerender) | `AdminServerGuard` awaits `connection()` and redirects to `/setup` when Supabase isn't configured |
| `/offline` (service-worker fallback) redirected to `/setup` in setup mode | Proxy allows `/offline` in setup mode |
| WebKit/Safari couldn't call `/api/*` on `http://localhost` (CSP `upgrade-insecure-requests`) | Directive removed; HSTS enforces HTTPS in production |
| Syntax error in `/api/discover/creators` regex | Fixed |

## Not yet covered (honest gaps)
* **No end-to-end journeys against a real Supabase project** (sign-up → chat → snap → call). These need a
  configured project and two test accounts; not written yet — will be added on request.
* **LiveKit calls, FCM push, Resend email and R2 uploads** have not been exercised against live services.
* No manual browser QA pass yet of the authenticated UI.
* No load/performance testing.
