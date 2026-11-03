# Feature Implementation Report — Quick Chat

**Date:** 4 Nov 2026
**Scope:** orange redesign, calling and video effects, location sharing, Quick Chat Premium (Razorpay), admin Premium management.

**Labels:**
- **DONE:** implemented and verified by tests.
- **DONE (not verified):** implemented but not exercised by a test.
- **NOT DONE:** not implemented.
- **BLOCKED:** needs credentials or approval from the owner.

## Summary

| Area | Status | Notes |
|---|---|---|
| Light-orange design system (#FF9F43 / #FFB76B / #FFF8F0 / #FFE4C7 / #242424 / #F47B20) | DONE | Tokens in `globals.css`. Text on orange is dark (#242424, ≥5.7:1); orange text uses darker shades that pass WCAG AA. |
| Header: chat and call icons left, QUICK CHAT centred, search / notifications / avatar right | DONE | 3-column grid keeps the wordmark centred. |
| Mobile bottom nav: Chats, Camera, Stories, Calls, Profile | DONE | Other pages are in the avatar ("Account menu"). |
| Opening screen: brand, stories, recent chats, unread, call strip, camera shortcut | DONE (not verified) | Missed calls appear only after Calls has been opened in that session. |
| Voice and video calls (existing LiveKit) | DONE | Already had accept, decline, end, duration, history, missed calls, mute, camera, switch camera, speaker, quality indicator, reconnection and group calls. |
| Incoming-call reliability | DONE | Also re-checks every 15 s in case a realtime update is missed. |
| Video effects | DONE (colour filters verified in a call) | None, Natural, Brightness, Soft focus, Warm, Cool, Vintage, Black & white, Background blur, Virtual background. Applied locally on the outgoing track. MediaPipe is self-hosted, so camera frames never leave the device except as the call video. |
| Face effects | NOT DONE | No licence-free, reliable face-effect model was added. |
| Location: static, live (15 min, 1 h, 8 h, Until I stop), stop, expiry, members only | DONE | "Until I stop" ends automatically after 24 h as a safety limit. |
| Quick Chat Premium: plans, checkout, verification, webhooks, entitlements, renewals, cancellation, expiry, refunds | DONE (Razorpay not connected) | See PAYMENT_INTEGRATION_REPORT.md. |
| Premium features | DONE | Badge, profile themes, profile analytics, bigger uploads (server-enforced) and premium call effects (Vintage, Virtual background). |
| Premium dashboard (Settings → Premium) | DONE | |
| Admin Premium | DONE | Counters, revenue, transactions, subscriptions, reconciliation, and audited grant/revoke. |
| Music features | NOT DONE | The project has no music feature to extend. |

Not implemented, and **not advertised** on the pricing page:
- story customization;
- chat themes;
- premium stickers;
- music and snap editing;
- extra storage beyond the daily upload quota.

## Database changes (additive)

| Migration | Contents |
|---|---|
| `20261104000100_premium.sql` | Tables: `subscription_plans` (₹49 / ₹299 / ₹1,999), `subscription_entitlements`, `razorpay_customers`, `user_subscriptions`, `payment_transactions`, `payment_webhook_events`, `payment_audit_logs`. New column `profiles.profile_theme`. Functions: `private.has_entitlement`, `my_entitlements`, `is_premium_user`, `profile_premium`, `set_profile_theme`, `my_profile_view_daily`, `premium_apply_payment`, `premium_apply_refund`, `run_premium_maintenance`, `admin_premium_stats`, `admin_set_premium`. RLS on every table. |
| `20261104000200_location_until_stopped.sql` | `start_location_share` accepts 1440 minutes. |

How this maps to the requested tables:
- **Payments:** `subscription_payments` and `payment_transactions` are one table, `payment_transactions`.
- **Calls:** call history and participants already existed (`calls`, `call_participants`).
- **Location:** `location_shares` already existed. Separate location share events were not added.
- **Video effect preference:** stored per device in the browser, not in the database.

## New APIs

**Premium:**
- `GET /api/premium`
- `POST /api/premium/checkout`
- `POST /api/premium/verify`
- `POST /api/premium/failed`
- `POST /api/premium/cancel`
- `POST /api/premium/webhook`
- `POST /api/premium/theme`
- `GET /api/premium/analytics`

**Admin:**
- `GET /api/admin/premium`
- `POST /api/admin/premium/reconcile`
- `POST /api/admin/premium/grant`

## Configuration the owner must add

1. Run the SQL file `quick-chat-premium-update.sql` in Supabase (SQL Editor). Until then, Premium stays off and everything else works.
2. Add these in Vercel, using Razorpay **test** keys first:
   - `RAZORPAY_KEY_ID`
   - `RAZORPAY_KEY_SECRET`
   - `RAZORPAY_WEBHOOK_SECRET`
3. Add the Razorpay webhook:
   - URL: `https://quickchat.akarikatechnologies.me/api/premium/webhook`
   - Events: `payment.*`, `order.paid`, `subscription.*`, `refund.*`
4. Confirm the tax wording. The pricing page says prices "include all applicable taxes"; change it if your GST setup differs.
