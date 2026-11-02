# Quick Chat — Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Every page redirects to `/setup` | `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` missing at build/runtime | Set them and redeploy (NEXT_PUBLIC values are inlined at build time). |
| Server logs `config error: … exposed to the browser` and refuses to start | A secret-looking variable starts with `NEXT_PUBLIC_` | Rename it without the prefix. |
| Uploads fail with "Media storage isn't configured" | No R2 credentials and no `SUPABASE_SERVICE_ROLE_KEY` | Configure one storage option (SETUP §2). |
| Upload reaches 100% then "file contents don't match its type" | The file's bytes don't match its declared type (renamed file) | Upload a genuine image/video/document. |
| Upload to R2 fails in the browser (CORS error) | Bucket CORS missing the app origin or `Content-Type` header | Apply the CORS policy in SETUP §2. |
| Images/videos don't render; CSP errors in console | CSP built before storage/LiveKit env vars were set | Redeploy after setting `CLOUDFLARE_ACCOUNT_ID` / `LIVEKIT_URL`. |
| Email confirmation link says expired/invalid | Email template still uses `{{ .ConfirmationURL }}`, or redirect URL not allow-listed | Use the token-hash templates and redirect URLs in SETUP §1.4. |
| Google sign-in returns to login with an error | Redirect URL not allow-listed or wrong OAuth redirect URI | Check SETUP §1.6 and Supabase Redirect URLs. |
| `/admin` shows "Two-factor authentication required" | Admin session is `aal1` | Enroll TOTP in Settings → Security, then sign in again with the code. For local dev only you may set `ADMIN_REQUIRE_MFA=false`. |
| Typing indicators never show | Realtime private channels blocked or migration 0700 not applied | Re-run the last migration; check Realtime → Settings. Chat still works without typing indicators. |
| New messages appear only after refresh | Tables missing from `supabase_realtime` publication | `select * from pg_publication_tables where pubname = 'supabase_realtime';` — re-apply migration 0700. |
| Snaps/stories don't disappear | `pg_cron` not enabled and cron route not configured | Enable pg_cron (SETUP §1.2) and `CRON_SECRET`. Note: expired content is already hidden by RLS; jobs only clean up. |
| Calls show "not configured" | LiveKit env vars missing | SETUP §3. |
| Call connects but no audio/video | Browser permission denied or no device | Allow camera/microphone in the site settings; on iOS use Safari ≥ 15. |
| No push notifications | Permission not granted, FCM vars missing, iOS not installed to Home Screen | SETUP §4; check `/api/health` → `integrations.push`. |
| `429 rate_limited` responses | Rate limits hit | Wait for `Retry-After`; tune limits in route handlers or database functions. |
| `503 maintenance` | Maintenance mode on | Admin → Settings → turn off maintenance mode. |
| Database tests fail locally | Out-of-date `node_modules` | `npm ci`, then `npm run test:db`. |
