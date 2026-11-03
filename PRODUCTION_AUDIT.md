# Production Audit — Quick Chat

**Date:** 3 Nov 2026
**Scope:**
- the existing repository: Next.js 16.4 App Router, Supabase, LiveKit, Resend, FCM;
- the live deployment at https://quickchat.akarikatechnologies.me.

**Method:** every problem was reproduced or proven before any change.
- **Live probes:** health and config endpoints, the Supabase auth redirect allowlist, headers.
- **Browser traces:** Playwright in Chromium, Chrome, Brave, Edge, Firefox, WebKit, Pixel 7 and iPhone 14.
- **Library source:** read for `@supabase/ssr` and zod.

Fix details are in BUG_FIX_REPORT.md.

## Findings

| # | Area | Issue | Root cause | Status |
|---|---|---|---|---|
| 1 | Google OAuth | Fails first time, works on retry | vercel.app address not in the Supabase redirect allowlist → returned to `.me` without the PKCE cookie | Fixed (308 redirect) — PASS |
| 2 | Google OAuth / Safari | Button stuck after Back | back/forward cache restored the busy state | Fixed — PASS |
| 3 | Google OAuth | Duplicate callback shows an error | code already exchanged | Fixed — PASS |
| 4 | Logout | Signed out every device | `signOut()` defaults to global scope | Fixed — PASS |
| 5 | Logout | Frontend-only reset; Back exposed the app | `router.replace`, no server sign-out, no bfcache check | Fixed — PASS |
| 6 | Sessions | Remember me ignored; 400-day cookies | `@supabase/ssr` overrides `maxAge`; singleton cache | Fixed — PASS |
| 7 | PWA | No install option | prompt event lost before hydration; only shown in-app; no iOS steps | Fixed — PASS |
| 8 | Config | Build failed with URL lacking a scheme | `new URL()` on raw env value | Fixed — PASS |
| 9 | CSP / Firefox | Console error on every page | zod eval probe | Fixed — PASS |
| 10 | Safari | Session lost on HTTP builds | Secure cookies over http | Fixed — PASS |
| 11 | Routing | Prefetch 404s after sign-in | proxy redirected segment prefetches | Fixed — PASS |
| 12 | PWA / mobile | No install button in phone settings | placed in a desktop-only card | Fixed — PASS |
| 13 | Logout | Two concurrent navigations | listener and caller both redirected | Fixed — PASS |
| 14 | Push | Push prompt/settings hidden in production | `FIREBASE_SERVICE_ACCOUNT` not set | Config — owner action |
| 15 | Dependencies | 4 high: `@grpc/grpc-js` via Firebase Firestore | Firestore isn't used or bundled; npm's only fix is downgrading to Firebase 9 | Accepted, documented |
| 16 | Dependencies | 6 moderate (glob/minimatch via firebase-admin) | outdated transitive deps | Fixed (`npm audit fix`) |

## Checked and found correct

- **Supabase clients:** one browser singleton, a per-request server client, a proxy client. They use the `@supabase/ssr` getAll/setAll pattern; there are no duplicate or conflicting auth implementations.
- **PKCE:** the flow runs as a top-level redirect (no popup). The verifier cookie is SameSite=Lax, and the callback exchanges the code on the server.
- **Service worker:**
  - pages are network-first with an offline fallback;
  - only hashed assets are cached, and the cache is versioned with old caches deleted;
  - `/api`, auth and media are never cached;
  - `sw.js` is served `no-store`.
- **Security headers:** strict CSP (no `unsafe-eval`), HSTS preload, `frame-ancestors 'none'`, COOP, nosniff.
- **APIs:**
  - anonymous calls rejected;
  - cross-site POSTs rejected (Origin check);
  - cron requires its secret;
  - admin APIs return 401/403 for non-staff;
  - staff without two-factor sign-in are blocked when `ADMIN_REQUIRE_MFA=true`.
- **Data isolation:**
  - a non-member gets no messages from a conversation that holds a real private message;
  - row-level security is covered by 92 database tests (migrations, messaging, social, snaps/stories, calls/discover/admin).
- **Secrets:** no service-role key, LiveKit secret, Google secret or R2 key appears in client bundles. Only `NEXT_PUBLIC_*` values are public.
- **Manifest:**
  - name and short_name "Quick Chat", standalone display, start_url, scope `/`;
  - theme and background colours;
  - 192, 512 and maskable icons, all reachable.

## Not verified (see the other reports)

- Completing Google sign-in with a real Google account: needs a human.
- Real Safari on macOS/iOS: there's no Apple hardware here. WebKit and iPhone emulation were used instead.
- Snaps, Stories, calls and media uploads in a browser: covered by API and database tests, not by browser tests in this round.
