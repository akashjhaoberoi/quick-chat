# Quick Chat — Security & Privacy Model

## What Quick Chat does and does not promise

| Topic | Reality |
| --- | --- |
| Encryption | All traffic uses TLS. Data is encrypted at rest by the infrastructure providers (Supabase/Postgres, Cloudflare R2 or Supabase Storage). **Messages are not end-to-end encrypted** — the service operator could technically access stored content. We do not advertise E2EE. |
| Disappearing content | Enforced on the **server**: expired snaps, stories and disappearing messages are hidden by Row Level Security the instant they expire, their media can no longer be signed for download, and scheduled jobs delete the rows/objects. A recipient can still photograph a screen; nothing on the web can prevent that. |
| Screenshot alerts | **Best-effort only.** Browsers do not expose a reliable screenshot event. Quick Chat reports keyboard screenshot shortcuts it can observe; most screenshots (OS tools, phone hardware buttons, other devices) are undetectable. The UI says so. |
| Location | Shared only when a user explicitly chooses to share with a specific chat; live sharing is time-boxed (15 min / 1 h / 8 h) and can be stopped at any time. Never public. |
| Moderation | Moderators never get access to private conversations. Reporting a message snapshots only that message (as the reporter saw it); moderators review the snapshot and reported media only. |

## Authorization architecture

1. **Database is the authority.** Every table has Row Level Security enabled (a test asserts this).
   `authenticated` has no INSERT/UPDATE/DELETE grants except a whitelist of self-service columns
   (`user_settings` preferences) and deleting own notifications/push tokens.
2. **Writes are RPCs.** Each mutation is a `SECURITY DEFINER` function that derives the actor
   from `auth.uid()`, validates permissions (membership, friendship, blocks, roles, ownership of
   media, expiry, rate limits) and performs the change atomically.
3. **Internal helpers** (`private.*`) are not exposed by PostgREST, and dangerous internals
   (`notify`, `award_score`, `post_message`, …) have EXECUTE revoked from `authenticated`.
4. **API layer** (`src/lib/api/handler.ts`) adds: JWT verification (`auth.getClaims()`),
   admin role checks + mandatory TOTP (aal2) for admin routes, CSRF protection (Origin /
   Sec-Fetch-Site checks on mutating requests + SameSite=Lax cookies), maintenance mode,
   rate limiting (Redis or in-memory), zod validation with body-size limits, and generic error
   messages (no internal details leak).
5. **Admin access** cannot be obtained through the UI: `admin_roles` has no write grants; roles
   change only through `admin_set_role` (super admin, audited) or SQL by the operator.

## Abuse & spam controls
* Database-level limits: 25 messages / 10 s, 100 friend requests / day, 30 snaps / min, 15 comments / min, 30 reports / day, 20 groups / day, 10 calls / min.
* API-level limits per user/IP on every sensitive endpoint (`429` + `Retry-After`).
* Snap score caps (per reason per day and per recipient per day) prevent score farming.
* Blocking hides profiles both ways, removes friendships/follows, cancels requests, and stops
  messages, calls, snaps and story visibility.
* Uploads: MIME allow-list (no SVG/HTML), per-type size limits, 1 GB/day quota, and post-upload
  magic-byte verification (mismatches are deleted).

## Data protection
* Private media buckets; reads only via authorized short-lived signed URLs (≤10 min; snaps ≤ view window, never cached).
* Documents are always served as downloads (`Content-Disposition: attachment`).
* The service worker caches only static build assets — never API responses or media.
* Security headers: CSP (no third-party scripts besides Firebase's gstatic loader), HSTS,
  X-Frame-Options DENY / frame-ancestors none, nosniff, strict Referrer-Policy, Permissions-Policy
  limiting camera/microphone/geolocation to the app itself.
* Link previews are fetched server-side with SSRF protection (DNS resolution checks against
  private/loopback/link-local ranges, manual redirect validation, timeouts, size caps).
* Secrets live only in server environment variables; startup aborts if a secret-looking variable
  is exposed through `NEXT_PUBLIC_`.

## Sessions
* Supabase Auth (bcrypt password hashing — passwords are never stored by Quick Chat).
* "Remember me" off → auth cookies become browser-session cookies.
* Login activity is recorded; new-device sign-ins trigger an email alert (when Resend is set up).
* "Sign out of other devices" revokes refresh tokens; already-issued access tokens remain valid
  until they expire (default 1 hour — shorten the JWT expiry in Supabase for stricter control).
* Suspensions/bans are enforced both in the database (`account_inactive`) and at the auth layer
  (`ban_duration`).

## Audit
* Every admin action writes to `admin_audit_logs` (actor, action, target, details, IP).
* Viewing a user's login activity is itself logged.
* Background jobs record runs in `job_runs`; unexpected server errors are stored in `app_errors`.

## Backup strategy
* Enable Supabase **Point-in-Time Recovery** (Pro plan) or at minimum daily backups.
* R2: enable bucket versioning/lifecycle as desired; note that deleted disappearing media must
  not be retained beyond the retention policy — configure lifecycle rules accordingly.
* Store migrations in git (they are the schema source of truth); test restores quarterly.

## Security checklist (pre-launch)
- [ ] All migrations applied; `select relname from pg_class … where not relrowsecurity` returns nothing for `public`.
- [ ] `SUPABASE_SERVICE_ROLE_KEY`, `LIVEKIT_API_SECRET`, `FIREBASE_SERVICE_ACCOUNT`, `RESEND_API_KEY`, `CRON_SECRET` set only as server env vars.
- [ ] `ADMIN_REQUIRE_MFA=true`; every admin has TOTP enrolled.
- [ ] Supabase Auth: email confirmation on, redirect URLs restricted to the production domain(s), rate limits reviewed.
- [ ] R2 bucket private, CORS restricted to the app origin.
- [ ] `REDIS_URL` configured for consistent rate limiting across instances.
- [ ] pg_cron job present; Vercel cron configured with `CRON_SECRET`.
- [ ] Backups / PITR enabled.
- [ ] Run `npm run check` (types, lint, tests, build) on the release commit.
