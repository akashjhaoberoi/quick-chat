# Bug Fix Report — Quick Chat (production audit, 3 Nov 2026)

Each problem below was reproduced, or its cause shown, before any code changed. Status labels: **PASS** = tested and working · **FAIL** = tested and failing · **NOT TESTED** = not verified · **BLOCKED** = needs credentials or infrastructure that wasn't available.

## B1 — Google sign-in fails on first try, works on retry

**Symptom:** the first "Continue with Google" fails and a retry works.

**Root cause (proven):** Supabase only redirects to addresses on its allowlist. A probe of the live auth server showed:
- allowlisted: `https://quickchat.akarikatechnologies.me/**` and `http://localhost:3000/**`;
- not allowlisted: `https://quick-chat-xi-sand.vercel.app`.

Google sign-in started on the vercel.app address was returned to the `.me` Site URL instead. The one-time PKCE verifier cookie only exists on the address where sign-in began. So the exchange failed ("We couldn't complete sign-in"), and the retry worked because the user was now on `.me`.

**Fix:**
- The vercel.app address now permanently redirects (308) to `https://quickchat.akarikatechnologies.me` (Vercel domain setting), so sign-in always starts on the allowlisted domain.
- The callback recognises a missing verifier (`AuthPKCECodeVerifierMissingError`) and says how to recover instead of showing a generic error.

**Status:** fix PASS (redirect checked live). The full Google round trip is NOT TESTED, because it needs a real Google account.

## B2 — Safari: Google button stuck after coming back from Google

**Root cause:** Safari keeps pages in its back/forward cache. Pressing Back from Google's account chooser restored the login page with the button still spinning and disabled. The only way out was a reload, which counts as an extra attempt.

**Fix:** the button resets on `pageshow` when the page comes from that cache, and ignores double-clicks. Starting the flow twice used to create a second PKCE verifier that overwrote the first.

**Status:** PASS (WebKit and other engines: "Back from Google re-enables the button"; double-click sends exactly one authorize request).

## B3 — Callback opened twice shows an error

**Root cause:** if `/auth/callback?code=…` loads twice (double tap, a restored tab, a prefetch), the second request's code is already used. The user is signed in but saw "We couldn't complete sign-in".

**Fix:** when the exchange fails but a valid session already exists, the callback continues to the requested page.

**Status:** PASS.

## B4 — Logout signed the user out on every device

**Root cause:** `supabase.auth.signOut()` defaults to `scope: "global"`, which revokes every session of the account.

**Fix:** a single `signOutDevice()` in `src/components/auth/auth-utils.ts`. It calls `/api/auth/logout`, which revokes this session on the server and clears the auth cookies in the response. The browser client then signs out with `scope: "local"`. Every sign-out button uses it. "Sign out other devices" in Settings → Security still revokes the others on purpose.

**Status:** PASS ("signing out one device keeps other devices signed in"; "revokes the refresh token server-side").

## B5 — Logout only reset the page in the browser; Back could show protected content

**Root cause:** logout used `router.replace("/login")`. That keeps the client router cache, React Query data, realtime channels and LiveKit rooms in memory. Back could restore signed-in screens from the back/forward cache.

**Fix:**
- Logout does a full navigation (`location.replace`), which drops every in-memory resource.
- `SessionProvider` re-checks the session whenever a page comes back from that cache, and leaves for `/login` if signed out.
- Other tabs receive `SIGNED_OUT` and do the same.

**Status:** PASS ("Back after logout…", "other tabs … follow the sign-out", "repeated login and logout").

## B6 — "Remember me" had no effect; sessions lasted 400 days

**Root cause:** `@supabase/ssr` 0.12.7 always writes auth cookies with its own 400-day `Max-Age`, overriding the app's `cookieOptions`. Unticking Remember me still left a persistent cookie. Separately, the browser client's `isSingleton` cache meant a newly created client still used the old preference.

**Fix:** `withLifetime()` in `src/lib/supabase/cookies.ts` applies the real lifetime in all three cookie writers (browser, server, proxy): 30 days with Remember me, a browser-session cookie without it. The browser client reads the preference each time it writes a cookie.

**Status:** PASS ("uses browser-session cookies when Remember me is off", "survives a browser restart when Remember me is on").

## B7 — Install option missing

**Root cause:**
- The only install UI was a pop-up inside the signed-in app, sharing one slot with the notifications prompt, and dismissing either hid both for 7 days.
- Chrome fires `beforeinstallprompt` once per page load, usually on the landing or login page, where nothing listened, so the event was lost.
- iPhone and Mac Safari got no instructions at all.

**Fix:**
- An inline script in the root layout captures the event before React loads (`src/lib/pwa-install-script.ts`).
- `useInstallStatus()` (`src/lib/pwa-install.ts`) detects: prompt available, iOS, macOS Safari, already installed, or unsupported.
- `<InstallButton>` appears on the landing hero, the sign-in/register pages and Settings. It opens the native prompt, or step-by-step Safari instructions, and is hidden when already installed or when the browser can't install (no fake button).

**Status:** PASS (Chromium prompt simulation, iOS instructions dialog, hidden in standalone mode, hidden on Firefox).

## B8 — Build broke when `NEXT_PUBLIC_APP_URL` had no `https://`

**Root cause:** `.env.local` had `NEXT_PUBLIC_APP_URL=quickchat.akarikatechnologies.me`. `new URL()` in the root layout threw during the build ("Failed to collect page data for /_not-found").

**Fix:** the env schema adds `https://` and drops a trailing slash when needed, and the layout uses the validated value.

**Status:** PASS (the build succeeds).

## B9 — Firefox: security-policy error on every signed-in page

**Found by:** the route crawl on Firefox ("blocked a JavaScript eval … Missing 'unsafe-eval'").

**Root cause:** zod v4 runs `Function("")` on its first parse to see whether it can compile fast validators. Our CSP rightly has no `unsafe-eval`, so the probe fails. Zod handles that, but Firefox logs a CSP violation each time.

**Fix:** `src/lib/zod-config.ts` sets `z.config({ jitless: true })`. It's imported before any schema in `env.ts` and `validation.ts`. The CSP stays strict.

**Status:** PASS (Firefox route crawl clean).

## B10 — Safari dropped the session on local and plain-HTTP builds

**Found by:** WebKit and iPhone sign-in tests. After sign-in the server never saw the session cookie.

**Root cause:** cookies were marked `Secure` whenever `NODE_ENV=production`. Safari/WebKit rejects `Secure` cookies over `http://localhost`, so `next start` couldn't keep anyone signed in there.

**Fix:** `Secure` now follows the app URL (`https://` → Secure), so production stays Secure.

**Status:** PASS (WebKit and iPhone sign-in tests).

## B11 — Background prefetches 404'd after signing in

**Found by:** a WebKit debug trace showing `rsc 307 /register → /home` followed by `rsc 404 /home?_rsc=…`.

**Root cause:** the proxy redirected router prefetches of guest-only pages. With per-segment prefetching, the follow-up request asked `/home` for the `/register` segment, which returned 404 and logged console errors ("access control checks" in Safari).

**Fix:** prefetch requests skip the proxy (the matcher's `missing` condition, as in the Next.js proxy docs). Real navigations are still redirected, and the app shell re-checks the session.

**Status:** PASS.

## B12 — No Install button in the phone settings

**Root cause:** on phones `/settings` shows the settings menu, not the overview card where the button was placed.

**Fix:** the button is now part of the settings menu, so it shows on every screen size.

**Status:** PASS.

## B13 — Logout started two navigations

**Root cause:** `signOutDevice()` and the `SIGNED_OUT` listener both called `location.replace`. Firefox aborted one of them (`NS_BINDING_ABORTED`).

**Fix:** the listener skips its redirect while this tab's own sign-out is in progress. Other tabs still follow.

**Status:** PASS.

## Not bugs (investigated)

- **Service worker:** pages are network-first, only hashed build assets are cached, and `/api` and auth are never cached, so no stale auth pages are served.
- **CSP:** every external host the code uses is allowed.
- **Conversations:** a non-member receives an empty message list because row-level security filters it. This was verified with a real private message in the conversation.
- **"Features not displaying" in production:** `/api/config` reports every feature enabled except push. Push is off because `FIREBASE_SERVICE_ACCOUNT` isn't set in Vercel, so the push prompt and push settings stay hidden by design. Fix: add that variable and redeploy.
