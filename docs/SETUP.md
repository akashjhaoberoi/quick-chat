# Quick Chat — Setup Guide

This guide takes you from an empty Supabase project to a working Quick Chat, then enables each
optional integration. **Mandatory:** Supabase. **Optional:** Cloudflare R2, LiveKit, Firebase
Cloud Messaging, Resend, Redis. Every optional integration degrades gracefully: the UI shows a
"not configured" notice instead of a broken control, and `/api/health` reports what is enabled.

> Never commit `.env*` files. Variables starting with `NEXT_PUBLIC_` are sent to browsers —
> never put a secret in one (the server refuses to start if it detects that).

---

## 0. Prerequisites

* Node.js ≥ 20.9 (developed on Node 26) and npm.
* A Supabase project (free tier works for development).
* Optional: Supabase CLI (`npm i -g supabase`) to push migrations; otherwise paste them into the SQL editor.

```bash
npm install
cp .env.example .env.local
```

---

## 1. Supabase (required)

### 1.1 Keys
Project Settings → **API**:

| Variable | Where |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `anon` / publishable key |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role` / secret key (**server only**) |

Recommended: Project Settings → **JWT Keys** → migrate to asymmetric signing keys, so the server
verifies sessions locally (`auth.getClaims()`) without a network round-trip.

### 1.2 Extensions
Database → **Extensions**: enable `pg_trgm` (search) and `pg_cron` (minute-level expiry jobs).
`pg_trgm` is required; `pg_cron` is strongly recommended (without it, expiry still holds because
RLS hides expired rows, but cleanup runs only when the Vercel cron fires).

### 1.3 Database migrations
Apply every file in `supabase/migrations/` **in filename order**:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

…or paste each file into the SQL editor in order. The migrations create all tables, indexes,
Row Level Security policies, RPC functions, the realtime publication, realtime channel
authorization, the private `media` storage bucket and the `quickchat-maintenance` pg_cron job.

Verify:

```sql
select count(*) from pg_tables where schemaname = 'public';              -- ≥ 40
select jobname, schedule from cron.job;                                   -- quickchat-maintenance
select public.run_maintenance();                                          -- returns a JSON summary
```

### 1.4 Authentication
Authentication → **URL Configuration**:

* **Site URL:** `https://quickchat.akarikatechnologies.in` (or `http://localhost:3000` locally)
* **Redirect URLs:**
  ```
  http://localhost:3000/**
  https://quickchat.akarikatechnologies.in/**
  ```

Authentication → **Providers**:
* **Email:** enabled, "Confirm email" **on**, minimum password length 10.
* **Google:** see §1.6.

Authentication → **Email Templates** — use the server-side token flow so links work across devices.
Replace the link in each template:

| Template | Link |
| --- | --- |
| Confirm signup | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/onboarding` |
| Reset password | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password` |
| Change email address | `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email_change&next=/settings/account` |

Authentication → **Multi-Factor**: enable **TOTP** (required for administrators).

Authentication → **Rate Limits**: keep the defaults or tighten sign-in/sign-up limits; these
protect the password endpoints (called directly by the browser) against brute force.

### 1.5 Custom SMTP via Resend (recommended)
Supabase's built-in mailer is heavily rate-limited. Authentication → **SMTP Settings**:

| Field | Value |
| --- | --- |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | your Resend API key |
| Sender | `no-reply@quickchat.akarikatechnologies.in` (domain verified in Resend) |

### 1.6 Google sign-in
1. Google Cloud Console → APIs & Services → **Credentials** → Create **OAuth client ID** (Web).
2. Authorized JavaScript origins: `https://quickchat.akarikatechnologies.in`, `http://localhost:3000`.
3. Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`.
4. Paste client ID/secret into Supabase → Authentication → Providers → **Google**.

### 1.7 Realtime
The migrations add the needed tables to the `supabase_realtime` publication and authorize
private broadcast channels (`conv:<id>`, used for typing indicators) to conversation members.
In Realtime → **Settings** you may disable "Allow public access" so only private (authorized)
channels can be joined.

---

## 2. Media storage

Uploads go **directly from the browser to storage** through short-lived signed URLs; the server
then verifies size and file signature. Objects are never public: every read goes through
`/api/media/:id`, which checks permissions and redirects to a signed URL valid for ≤10 minutes
(Snap media: only while the recipient's view window is open).

### Option A — Supabase Storage (default, zero extra setup)
Used automatically when R2 is not configured. The private `media` bucket is created by
`20261102000710_storage_bucket.sql`. Requires `SUPABASE_SERVICE_ROLE_KEY`.

### Option B — Cloudflare R2 (recommended for scale; no egress fees)
1. Cloudflare dashboard → **R2** → Create bucket (e.g. `quickchat-media`). Keep it **private**.
2. R2 → **Manage R2 API Tokens** → create a token with *Object Read & Write* on that bucket.
3. Set `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_R2_ACCESS_KEY_ID`, `CLOUDFLARE_R2_SECRET_ACCESS_KEY`,
   `CLOUDFLARE_R2_BUCKET_NAME`. (`CLOUDFLARE_R2_PUBLIC_URL` is optional and only extends the CSP.)
4. Bucket → Settings → **CORS policy**:
   ```json
   [{
     "AllowedOrigins": ["https://quickchat.akarikatechnologies.in", "http://localhost:3000"],
     "AllowedMethods": ["PUT", "GET", "HEAD"],
     "AllowedHeaders": ["Content-Type", "Range"],
     "MaxAgeSeconds": 3600
   }]
   ```

When R2 is configured it becomes the provider for **new** uploads; existing objects keep working
because each `media_assets` row records its provider.

---

## 3. LiveKit — audio & video calls (optional)

1. Create a project at **LiveKit Cloud** (or self-host `livekit-server`).
2. Settings → **Keys** → create an API key.
3. Set `LIVEKIT_URL` (`wss://<project>.livekit.cloud`), `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`.

Tokens are minted server-side (`POST /api/calls/:id/join`) only after the database confirms the
caller is a participant, are scoped to one room and expire after 15 minutes. The secret never
reaches the browser. Without LiveKit, call buttons show a setup notice — nothing pretends to ring.

---

## 4. Firebase Cloud Messaging — browser push (optional)

1. Firebase console → create a project → **Add app → Web**. Copy the config into the
   `NEXT_PUBLIC_FIREBASE_*` variables.
2. Project settings → **Cloud Messaging** → *Web configuration* → **Generate key pair**; put the
   public key in `NEXT_PUBLIC_FIREBASE_VAPID_KEY`.
3. Ensure **Firebase Cloud Messaging API (V1)** is enabled in Google Cloud.
4. Project settings → **Service accounts** → *Generate new private key*. Put the JSON (raw, or
   base64-encoded) in `FIREBASE_SERVICE_ACCOUNT` (server only).

Delivery path: the database creates the notification → the API dispatches it immediately via FCM
(`claim_push_notifications` guarantees at-most-once) → `/sw.js` renders it. The cron job sweeps
anything not dispatched inline.

Browser limitations: iOS/iPadOS Safari supports web push only for sites **added to the Home
Screen** (iOS 16.4+); users must grant permission; private windows may block push; delivery
timing is controlled by the browser vendor's push service.

---

## 5. Resend — security emails (optional)
Set `RESEND_API_KEY` and `RESEND_FROM_EMAIL` (verified domain). Used for new-device sign-in,
password-change and 2FA-change alerts. (Verification/reset emails are sent by Supabase — §1.5.)

## 6. Redis — shared rate limiting (optional)
Set `REDIS_URL` (e.g. Upstash `rediss://default:<password>@<host>:6379`). Without it, rate limits
are per serverless instance; the most important limits are also enforced inside database RPCs.

## 7. Background jobs
* **pg_cron** (`quickchat-maintenance`, every minute): expires snaps, disappearing messages and
  stories, ends stale calls, records lost streaks, sends streak reminders, lifts finished
  suspensions, marks orphaned media for deletion.
* **Vercel Cron** (`vercel.json` → `GET /api/cron/cleanup` every 10 minutes): runs maintenance,
  deletes storage objects marked `pending_delete`, sweeps undelivered pushes. Set `CRON_SECRET`.
  *Vercel Hobby plans only allow daily crons — change the schedule to `0 3 * * *` there; media is
  already inaccessible before deletion because signed URLs are no longer issued.*

## 8. Create the first administrator
Admin rights can only be granted in the database — never from the UI of a regular account.

1. Sign up normally and finish onboarding.
2. Settings → Security → enable **two-factor authentication** (required for `/admin` while
   `ADMIN_REQUIRE_MFA=true`).
3. In the Supabase SQL editor:
   ```sql
   insert into public.admin_roles (user_id, role)
   select id, 'super_admin' from public.profiles where username = '<your-username>';
   ```
4. Sign out and back in with your 2FA code (to obtain an `aal2` session), then open `/admin`.
   Super admins can grant `moderator` / `admin` roles to others from **Admin → Users**.

## 9. Run locally

```bash
npm run dev          # http://localhost:3000
npm run test         # unit + database (PGlite) tests
npm run test:e2e     # Playwright (see docs/TESTING.md)
npm run build        # production build
```

Check `http://localhost:3000/api/health` to confirm which integrations are active.
