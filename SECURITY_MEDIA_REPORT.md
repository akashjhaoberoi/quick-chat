# Security Media Report — Quick Chat

**Date:** 3 Nov 2026
**Scope:** profile photos, cover photos, chat media, Snaps.
**Labels:**
- **PASS:** tested and working.
- **FAIL:** tested and failing.
- **NOT TESTED:** not verified.
- **NOT SUPPORTED:** the browser or platform doesn't offer the capability, so nothing is claimed.

## Summary

Media is stored in a private bucket. No permanent or public URLs exist. Every read goes through `/api/media/:id`, which:
1. checks the database rules for this viewer;
2. redirects to a signed link that expires in 5 minutes, or 1 minute for protected media.

The rules now also cover:
- profile and cover photo visibility;
- view-once media;
- protected media that can't be downloaded or forwarded.

In the browser, protected media:
- blocks the usual ways to save it (right-click, drag, long-press, print);
- carries a moving watermark with the viewer's name;
- is hidden when Quick Chat is in the background or loses focus.

**No website can stop screenshots, screen recording or a camera pointed at the screen.** Quick Chat doesn't claim to. Screenshot alerts are best effort and only cover computer shortcuts the browser can see.

## Implemented protection

| Area | What it does | Where enforced |
|---|---|---|
| Profile photo visibility | Everyone, Friends or Only me. Blocked users never see it. Others see initials. | Database: `private.profile_media_visible` → `can_access_media`; `profile_summary` hides the id |
| Cover photo visibility | Same options. A private account's cover stays friends-only. | Database (same functions) |
| Private storage | Bucket `media` is private, with no storage policies for users. Uploads need a server-issued signed upload URL. | Supabase Storage + `/api/media/upload-url` |
| Signed URLs | 5 min for ordinary media. 60 s for protected, view-once and Snap media. A view-once link never outlives its view window. | `/api/media/[id]` |
| Caching | Protected media: `Cache-Control: no-store`. Others: `private`, max 4 min. `Referrer-Policy: no-referrer`. | `/api/media/[id]` |
| Download control | Protected and view-once media refuse `?download=1` (403), and the viewer has no download button. | `/api/media/[id]`, viewer |
| Forwarding | Protected and view-once messages can't be forwarded (`cannot_forward_protected`), and the menu hides Forward. | Database `forward_message`, chat menu |
| View once | Nothing loads until the recipient opens it. Opening starts one window (photos 60 s, videos length + 30 s, max 10 min). The window closes when the viewer closes or the page is hidden. Reopening fails. | Database `open_message_media`, `close_message_media`, `can_access_media` |
| View-once expiry | Media is deleted once every recipient's window has closed, or after 14 days unopened. | `run_media_maintenance` (daily cron) |
| Disappearing (24h) | The message and its media are deleted after 24 hours. | `post_message` sets `expires_at`; existing `run_maintenance` |
| Access revocation | Deleting a message for everyone, leaving a chat, blocking, or changing visibility removes access at once for new requests. | `can_access_media` (checked on every request) |
| Access log | Every fetch of protected, view-once or Snap media is logged: who, what, when. Kept 30 days. Service role only. | `media_access_log` |
| Screenshot reports | Detected shortcuts on protected or view-once media notify the sender (at most once a minute), honour their "Screenshot alerts" setting, and are logged. Kept 180 days. | `report_media_screenshot`, `media_security_events` |
| Save gestures | Protected media has no context menu, drag, selection or iOS long-press save (a transparent layer covers the image) and is hidden when printed. All avatars also block menu and drag. | `ProtectedImage`, `Avatar`, `globals.css` |
| Watermark | Shows "Quick Chat · @viewer · account tag · date and time" and moves every 6 s. The tag is a one-way hash of the user id; no email or id is shown. | `Watermark` (profile/cover viewers, protected and view-once media, Snaps) |
| Background privacy | Media is covered when the page is hidden, and in the viewer and Snaps also when the window loses focus (Snipping Tool overlay, switching apps). Video pauses. | `usePageConcealed`, `PrivacyShield` |
| Warning before opening | View-once media asks for confirmation and explains the rules. | Chat bubble |

## Storage changes

- No bucket changes were needed: `media` was already private, with signed uploads and signed reads.
- There were never public URLs, so none had to be revoked or migrated.
- Spent view-once media is now marked `pending_delete`. The existing cron then removes the object from storage.

Upload checks were already in place and are unchanged:
- size limits per type;
- MIME allow-list (no SVG/HTML);
- a file-signature check after upload (`sniffMatches`);
- a daily byte quota.

## Database changes (`20261103000100_media_protection.sql`, additive)

**New columns:**
- `user_settings`: `avatar_visibility`, `cover_visibility`, `media_watermark`, `default_media_mode`. Users can update these through column grants.
- `messages`: `media_mode`, one of `normal`, `view_once`, `disappearing` or `protected`.

**New tables:**
- `message_media_views`
- `media_security_events`
- `media_access_log` (RLS on, no user policies)

**Replaced:**
- `can_access_media`
- `profile_summary` (adds `media_watermark`)
- `post_message`
- `send_message` (adds `p_media_mode`)
- `forward_message`

**New:**
- `open_message_media`
- `close_message_media`
- `report_media_screenshot`
- `run_media_maintenance` (service role only)

Anonymous visitors can't run any new function. Defaults keep today's behaviour: everyone can see photos, and messages are normal.

## API changes

| Endpoint | Change |
|---|---|
| `GET /api/media/:id` | Mode-aware lifetime, no-store for protected media, 403 on download of protected media, access logging |
| `POST /api/messages` | Accepts `mediaMode` |
| `POST /api/messages/:id/view-once` | **New:** opens view-once media and returns `viewExpiresAt` |
| `DELETE /api/messages/:id/view-once` | **New:** ends the viewer's window |
| `POST /api/messages/:id/screenshot` | **New:** best-effort screenshot report |
| `GET /api/messages/*` | Messages include `media_mode`, plus `view_once` status (opened, opened count for the sender, expired) |
| `GET /api/cron/cleanup` | Also runs `run_media_maintenance` |

## UI changes

- **Settings → Media protection** (new): profile and cover photo visibility, watermark, default protection for sent media, screenshot alerts, and links to active sessions, blocked accounts and privacy.
- **Chat composer:** a picker (Normal / View once / Protected / 24h) appears when photos or videos are attached. View once sends one file per message.
- **Chat bubbles:**
  - view-once bubble with status (Tap to view / Opened / Not opened yet / Expired);
  - "Protected" and "Disappears in 24h" badges.
- **Secure viewer** (new) for protected and view-once media and for profile and cover photos.
- **Profile:** the cover and photo open in the secure viewer, with a watermark when the owner chose it.

## Screenshot detection capabilities

| Platform | What a web page can observe | Status |
|---|---|---|
| Windows (Chrome, Edge, Brave, Firefox) | PrintScreen key (usually on key-up) | Detected and reported; **PASS** (automated) |
| Windows Snipping Tool (⊞⇧S) | Sometimes the key; always a window blur | Media hidden on blur (**PASS**); a report only if the key arrives |
| macOS (⌘⇧3/4/5) | Usually nothing: the OS takes the keys | **NOT SUPPORTED** (no reliable signal); ⌘⇧5's toolbar blurs the window, so media is hidden |
| iPhone / iPad Safari | Nothing | **NOT SUPPORTED** |
| Android Chrome / Brave | Nothing (no web API) | **NOT SUPPORTED** |
| Screen recording (any OS) | Nothing | **NOT SUPPORTED** |
| Another camera | Nothing | **NOT SUPPORTED**; the watermark helps trace leaks |

## Browser compatibility

Tested locally on a production build, with real users and a real Supabase (auth, database, storage).

**Automated, local:**

| Test | Chromium | Chrome | Edge | Brave | Firefox | WebKit (Safari engine) | Android (Pixel 7 emul.) | iPhone 14 (emul.) |
|---|---|---|---|---|---|---|---|---|
| Signed-out access refused (401) | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Profile/cover visibility, link lifetime, watermark, no menu or drag | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Protected media: no download, 60 s no-store, access log, no forward, shield on blur, PrintScreen report | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| View once: refused before opening, one window, closes when hidden, can't reopen, sender sees "opened" | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |
| Composer sends view once; settings save to the server | PASS | PASS | PASS | PASS | PASS | PASS | PASS | PASS |

Two tests failed on the first full run and passed on rerun:
- **Edge, profile test:** the local sign-in stalled.
- **Firefox, composer test:** it hit the 60 s budget. Long tests now get 120 s.

The local stall happens with or without these changes: a sign-in occasionally hangs on the local Supabase stack.

**Regression runs:**
- **Chromium:** the existing suites (auth, chat, all screens, admin, PWA, smoke) pass: 50 passed, 4 skipped (deployment-only or other-browser tests).
- **iPhone emulation:** chat and all screens pass.
- **Open item:** in Playwright's Windows WebKit, the all-screens test fails. Right after sign-in, the first pages sometimes redirect to /login (RSC requests "blocked by access control checks"); later pages render signed in. I couldn't confirm whether the previous version behaves the same, because the comparison build failed. Check this on real Safari during live testing.

**Database tests (PGlite with the real migrations):** 17 new tests, all PASS. They cover:
- visibility (everyone, friends, only me, private account, blocked);
- watermark flag;
- mode validation;
- view-once window and expiry;
- forwarding;
- disappearing;
- revocation on delete;
- screenshot reports and preferences;
- maintenance;
- privileges.

**NOT TESTED (needs real devices):**
- real Apple Safari on macOS and iOS;
- real Android phones;
- the iOS long-press menu;
- the app-switcher snapshot.

The emulated iPhone and Android runs use Safari's and Chrome's engines with mobile viewports, not real devices.

## Remaining limitations

1. **Screenshots, screen recording and cameras can't be blocked** by any website. Watermarks and alerts discourage them.
2. **Developer tools:** a viewer can still read an image during its signed-link lifetime (≤ 60 s for protected media). They need access first, the link expires, and every access is logged.
3. **Mobile app switcher:** iOS and Android may take the app-switcher snapshot before the page can hide media.
4. **Storage cleanup timing:** spent view-once media is unreadable immediately, but the object is removed by the next daily cron run (up to ~24 h).
5. **Cached avatars:** after you narrow your photo visibility, someone who loaded your photo in the last 4 minutes may still have it in their browser cache.
6. **Avatar lists:** friend lists and chats still receive avatar ids for photos the viewer can't see. The server refuses the image and the app shows initials. The id alone reveals nothing.
