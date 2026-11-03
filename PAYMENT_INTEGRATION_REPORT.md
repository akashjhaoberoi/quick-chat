# Payment Integration Report — Razorpay

**Date:** 4 Nov 2026
**Gateway status:** integrated in code. **Not connected:** no Razorpay keys have been provided, so no real test-mode or live payment has been made.

## How it works

1. **Checkout:** `POST /api/premium/checkout` reads the plan amount from the database (never from the browser).
   - **Lifetime** (₹1,999): a one-time Razorpay **order**. No recurring payment.
   - **Monthly** (₹49) and **Yearly** (₹299): a Razorpay **subscription**. The Razorpay plan is created on first use, and its id is stored in `subscription_plans`.
   - **Duplicate protection:**
     - an unpaid checkout from the last 30 minutes is reused;
     - lifetime members can't buy again;
     - active subscribers can only upgrade to Lifetime.
2. **Payment window:** the browser opens Razorpay's official Checkout (`checkout.js`). Payment methods are whatever the merchant account has enabled: UPI (intent / QR / apps), cards, net banking and wallets. Amazon Pay appears only if Razorpay has enabled it for the account. Quick Chat never receives card numbers, CVV or UPI PINs.
3. **Verification:** `POST /api/premium/verify` checks the Checkout signature with the key secret, using HMAC-SHA256 of `order_id|payment_id` (orders) or `payment_id|subscription_id` (subscriptions). It then **fetches the payment, and the subscription, back from Razorpay**. Premium switches on only when the payment is *captured* and the amount and currency match the plan; this is checked in the database function `premium_apply_payment`, inside one transaction.
4. **Webhooks:** `POST /api/premium/webhook` is verified with the webhook secret over the raw body.
   - **Idempotency:** each `x-razorpay-event-id` is stored. A processed event is acknowledged without reprocessing; a failed one is retried.
   - **Events handled:**

     | Event | Effect |
     |---|---|
     | `payment.captured`, `order.paid` | Lifetime activation |
     | `payment.failed` | Recorded |
     | `subscription.activated`, `subscription.charged` | Activation and renewals; access is extended to the period end |
     | `subscription.pending` | Failed renewal, Razorpay retrying; logged |
     | `subscription.halted` | Halted |
     | `subscription.cancelled`, `subscription.completed` | Cancelled; access lasts to the period end |
     | `refund.created`, `refund.processed`, `payment.refunded` | A full refund ends access; a partial refund is recorded |
5. **Cancellation:** `POST /api/premium/cancel` cancels at the end of the cycle on Razorpay. Access lasts until the paid period ends.
6. **Expiry:** the daily cron runs `run_premium_maintenance`. It expires lapsed access and closes abandoned checkouts.
7. **Reconciliation:** an admin can re-fetch any payment from Razorpay and apply its real status (activation, failure or refund).
8. **Audit:** every checkout, signature failure, activation, failure, refund, cancellation, grant and revoke is written to `payment_audit_logs`. Admin grants are also written to `admin_audit_logs`.

## Security

- The key secret and webhook secret stay on the server. Only the public key id is sent to Checkout.
- Premium is decided by `private.has_entitlement` in the database. Changing state in the browser unlocks nothing: upload limits, themes and analytics are checked on the server.
- Users can't write to any payment table. `razorpay_customers` and `payment_webhook_events` aren't readable by users at all.
- The security policy (CSP) allows only Razorpay's Checkout script, frame and API hosts.
- Known gap: premium call effects run on the user's own device, so the lock on them is a UI lock only.

## Owner setup (required before payments work)

| Step | Where |
|---|---|
| Create **test** API keys | Razorpay Dashboard → Settings → API Keys |
| Add `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Vercel → Project → Settings → Environment Variables |
| Add the webhook | Razorpay → Webhooks: URL `https://quickchat.akarikatechnologies.me/api/premium/webhook`. Events: `payment.captured`, `payment.failed`, `order.paid`, `subscription.activated`, `subscription.charged`, `subscription.pending`, `subscription.halted`, `subscription.cancelled`, `subscription.completed`, `refund.created`, `refund.processed` |
| Enable Subscriptions and the payment methods you want (UPI AutoPay, cards, wallets) | Razorpay Dashboard. Product approval is Razorpay's decision. |
| Test with Razorpay test cards and UPI before switching to live keys | — |

## Test status

| Item | Status |
|---|---|
| Signature checks (order, subscription, webhook) | PASS, unit tests against Razorpay's documented formulas |
| Activation, idempotency, amount mismatch, renewal, cancel, expiry, refund, admin grant/revoke | PASS: database tests, plus end-to-end webhook tests through the real API route |
| Real Razorpay test-mode checkout (UPI, card, net banking, wallets, Amazon Pay) | **NOT TESTED**: no Razorpay keys |
