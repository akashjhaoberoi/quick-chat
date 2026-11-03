# Subscription Test Report — Quick Chat Premium

**Date:** 4 Nov 2026

**Environment:** a local production build with local Supabase. The webhook tests run the server with test-only Razorpay values (not real keys) and send webhooks signed exactly as Razorpay signs them.

**Labels:** PASS · FAIL · NOT TESTED

| Test | Result | Where |
|---|---|---|
| Three plans shown | PASS | `tests/premium/premium.spec.ts` |
| Monthly ₹49 per month | PASS | premium.spec, `tests/unit/razorpay.test.ts`, `tests/db/premium.test.ts` |
| Yearly ₹299 per year, "Best value" | PASS | premium.spec, db test |
| Lifetime ₹1,999, one-time, "no renewals" | PASS | premium.spec, db test |
| Taxes, renewal and cancellation terms shown | PASS | premium.spec |
| Activation only after a verified captured payment | PASS | premium.spec (webhook), db test |
| Forged Checkout signature rejected | PASS | premium.spec |
| Bad webhook signature rejected (401) | PASS | premium.spec |
| Duplicate webhook (same event id) ignored | PASS | premium.spec |
| Same payment in two different events applied once | PASS | premium.spec |
| Wrong amount never activates | PASS | premium.spec, db test |
| Failed payment recorded, no access | PASS | premium.spec, db test |
| Cancelled subscription keeps access to the period end | PASS | premium.spec |
| Expiry removes access (maintenance job) | PASS | premium.spec, db test |
| Renewal extends access | PASS | db test |
| Lifetime: access with no renewal date and no recurring charge | PASS | premium.spec, db test |
| Full refund removes access | PASS | premium.spec, db test |
| Premium-only APIs refuse free users (analytics, themes) | PASS | premium.spec, db test |
| Users can't write payment rows or call the payment functions | PASS | db test |
| Admin grant/revoke (audited); stats are admin-only | PASS | db test |
| Choosing a plan opens Razorpay Checkout | NOT TESTED | needs Razorpay test keys |
| Payment cancelled in the Razorpay window | NOT TESTED | needs keys; the code records it as cancelled |
| UPI, card, net banking, wallets, Amazon Pay | NOT TESTED | needs keys and the payment methods enabled on the merchant account |

**Counts:**
- Database: 10/10 Premium tests.
- Unit: 6/6.
- End to end: 6/6 Premium tests (Chromium).
