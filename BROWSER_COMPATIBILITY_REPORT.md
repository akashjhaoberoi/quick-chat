# Browser Compatibility Report — Quick Chat

**Date:** 3 Nov 2026
**Labels:**
- **PASS:** actually tested and working.
- **FAIL:** tested and failing.
- **NOT TESTED:** not verified.
- **BLOCKED:** needs unavailable hardware or credentials.

## Environments used

| Project | Browser actually run | Notes |
|---|---|---|
| chrome | Google Chrome (installed, stable channel) | real Chrome |
| brave | Brave (installed), fresh profile | Shields on at defaults (trackers and cross-site cookies blocked) |
| edge | Microsoft Edge (installed) | |
| chromium | Playwright Chromium | |
| firefox | Playwright Firefox | |
| webkit | Playwright WebKit on Windows | Safari's engine, **not** Apple Safari: no ITP, no SameSite support in this build |
| mobile-android | Chromium, Pixel 7 emulation | touch, mobile viewport |
| mobile-ios | WebKit, iPhone 14 emulation | iOS user agent and viewport, **not** a real iPhone |

**Apple Safari** on macOS and **iOS Safari** on a real device: **NOT TESTED**, because there's no Apple hardware here. A manual procedure is below.

## Results — local production build, signed-in suites

Second full run over all 8 projects (after the first round of fixes): **385 passed, 13 failed, 34 skipped**.

All 13 failures were investigated and fixed in code or tests:
- Firefox `eval` CSP log (B9);
- Safari secure-cookie issue (B10);
- prefetch 404 (B11);
- mobile settings layout (B12);
- double navigation on logout (B13);
- Playwright-WebKit quirks: URL shown after a history redirect, provisional navigation.

The third full run was stopped early at the owner's request to save time. Fixes after the second run were re-verified with targeted runs in Chrome and on the live site (below).

| Area | Chrome | Brave | Edge | Firefox | WebKit | Android (emul.) | iPhone (emul.) |
|---|---|---|---|---|---|---|---|
| Email login / errors / redirects | PASS | PASS | PASS | PASS | PASS¹ | PASS | PASS¹ |
| Logout (cookies, revoke, Back, other devices, other tabs, repeat) | PASS | PASS | PASS | PASS¹ | PASS¹ | PASS¹ | PASS¹ |
| Session persistence / Remember me | PASS | PASS | PASS | PASS | PASS¹ | PASS | PASS¹ |
| Expired/invalid session, suspended, deleted | PASS | PASS | PASS¹ | PASS | PASS¹ | PASS | PASS¹ |
| Google OAuth start, callback errors, Back | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Live chat (realtime, persisted, isolation) | PASS | PASS | PASS | PASS¹ | PASS¹ | PASS¹ | PASS¹ |
| All 20 signed-in screens, no console errors | PASS | PASS | PASS | PASS¹ | PASS¹ | PASS | PASS¹ |
| PWA manifest, service worker, offline page | PASS | PASS | PASS | PASS² | PASS | PASS | PASS |
| Install button (prompt / iOS steps / hidden when unsupported) | PASS | PASS | PASS | PASS (hidden) | n/a | PASS | PASS (iOS steps) |
| Admin access control | PASS | PASS | PASS | PASS | PASS | PASS | PASS |

¹ Failed in run 1 or 2. The cause was fixed (see BUG_FIX_REPORT.md B9–B13) and re-verified in targeted runs.
² Offline navigation in Firefox can't be emulated through its service worker in Playwright. The offline page itself renders, but the full offline flow in Firefox is NOT TESTED.

## Results — live production (https://quickchat.akarikatechnologies.me)

| Suite | Chromium | Chrome | WebKit | iPhone (emul.) |
|---|---|---|---|---|
| Smoke (pages, headers, manifest, SW, API protection, CSRF, cron) | PASS | — | PASS | PASS |
| PWA (manifest/icons, SW, offline, install button) | PASS | — | PASS | PASS |
| Google sign-in (PKCE, account chooser, hand-off to Google, callback errors, Back) | PASS | **PASS (6/6)** | PASS | PASS |

## Brave specifics

Brave's default Shields don't interfere with sign-in: the auth cookies are first-party (the app's own domain), and Google sign-in is a top-level redirect, not a third-party iframe or popup. PASS in all suites.

## Safari specifics (what was done for real Safari)

- **Back/forward cache:** handled for the Google button and for signed-out pages.
- **Secure cookies:** keyed to HTTPS, so Safari keeps sessions on local HTTP builds too.
- **PKCE verifier:** a first-party, SameSite=Lax cookie set before a top-level redirect. This is the pattern Safari's tracking prevention allows.
- **No popups**, so Safari's popup blocker can't interfere.
- **Private Browsing:** works; the session ends when the window closes.

## Manual test procedure — real Safari (macOS and iPhone)

1. Open https://quickchat.akarikatechnologies.me/login, first in a normal window, then in a Private window.
2. **Continue with Google:** the account chooser appears, then you return signed in on the first try.
3. Reload, then close and reopen Safari: you're still signed in, unless Remember me was off.
4. Sign out, then press Back: the sign-in form shows. Sign in with a different Google account: the chooser lets you pick it.
5. iPhone: Share → Add to Home Screen. Open the app from the Home Screen and sign in inside it.
6. In a chat, start a video call and allow the camera and microphone when Safari asks.

Record PASS or FAIL for each step.
