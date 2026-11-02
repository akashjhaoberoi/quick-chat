# Quick Chat — Production Deployment (Vercel)

Target domain: **https://quickchat.akarikatechnologies.in**

## 1. Pre-flight
1. Complete [SETUP.md](./SETUP.md) §1 against the **production** Supabase project (separate from development).
2. Locally, on the release commit: `npm ci && npm run check` (typecheck, lint, unit + DB tests, build).

## 2. Create the Vercel project
1. Import the Git repository in Vercel (Framework preset: Next.js; build command `next build`; Node 20+).
2. **Environment variables** (Production + Preview; never prefix secrets with `NEXT_PUBLIC_`):

| Variable | Required | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_APP_URL` | ✅ | `https://quickchat.akarikatechnologies.in` |
| `NEXT_PUBLIC_APP_NAME` | | `Quick Chat` |
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ | server only |
| `CRON_SECRET` | ✅ | random 32+ chars |
| `ADMIN_REQUIRE_MFA` | ✅ | `true` |
| `SUPABASE_STORAGE_BUCKET` | | default `media` |
| `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_R2_ACCESS_KEY_ID`, `CLOUDFLARE_R2_SECRET_ACCESS_KEY`, `CLOUDFLARE_R2_BUCKET_NAME`, `CLOUDFLARE_R2_PUBLIC_URL` | optional | media on R2 |
| `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | optional | calls |
| `NEXT_PUBLIC_FIREBASE_*` (6), `FIREBASE_SERVICE_ACCOUNT` | optional | push |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | optional | security emails |
| `REDIS_URL` | recommended | shared rate limits |

> The Content-Security-Policy is computed at **build time** from `NEXT_PUBLIC_SUPABASE_URL`,
> `LIVEKIT_URL`, `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_R2_PUBLIC_URL`. Redeploy after changing them.

3. **Cron**: `vercel.json` schedules `/api/cron/cleanup` every 10 minutes (Pro plan). On Hobby,
   change it to a daily schedule. Vercel sends `Authorization: Bearer $CRON_SECRET` automatically.

## 3. Domain
1. Vercel → Project → **Domains** → add `quickchat.akarikatechnologies.in`.
2. At the DNS provider for `akarikatechnologies.in`: `CNAME quickchat → cname.vercel-dns.com`.
3. Wait for the certificate; HSTS is sent by the app.

## 4. Point every integration at the domain
* **Supabase Auth** → Site URL `https://quickchat.akarikatechnologies.in`; Redirect URLs
  `https://quickchat.akarikatechnologies.in/**` (plus preview URLs if you test auth on previews,
  e.g. `https://*-akarika.vercel.app/**`). Email templates use `{{ .SiteURL }}` (SETUP §1.4).
* **Google OAuth** → Authorized JavaScript origin `https://quickchat.akarikatechnologies.in`;
  redirect URI stays the Supabase callback.
* **R2 CORS** → allow origin `https://quickchat.akarikatechnologies.in`.
* **Resend** → verify `akarikatechnologies.in` (SPF/DKIM) and use it as sender.
* **Firebase** → no domain config needed for FCM web push.
* **Cookies** → Supabase auth cookies are `SameSite=Lax`, `Secure` in production, scoped to the
  host. No cross-site cookies are used; the API rejects cross-origin mutating requests.

## 5. Post-deploy verification
```bash
curl -s https://quickchat.akarikatechnologies.in/api/health | jq
# expect: status "ok", database "ok", integrations reflect your config
curl -sI https://quickchat.akarikatechnologies.in | grep -i -E "content-security|strict-transport"
```
Then manually: register → verify email → onboarding → add a second account as friend → chat in
two browsers → send a snap → post a story → (if configured) start a call and receive a push.
Finally create the first admin (SETUP §8) and confirm `/admin` requires 2FA.

## 6. Rollback
Vercel → Deployments → promote the previous deployment. Database migrations are forward-only;
write a new corrective migration rather than editing an applied one.
