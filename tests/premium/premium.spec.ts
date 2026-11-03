import { createHmac, randomUUID } from "node:crypto";
import { test, type APIRequestContext } from "@playwright/test";
import { admin, canCreateUsers, createUser, deleteUsers, expect, login, NEEDS_USERS, type TestUser } from "../support/fixtures";

/**
 * Quick Chat Premium. Real Razorpay checkout needs Razorpay test keys and a
 * human in the payment window, so it isn't automated here. What is tested end
 * to end: the pricing page, the server-side webhook (signed exactly as
 * Razorpay signs it) activating, renewing, cancelling, refunding and expiring
 * Premium, duplicate-event protection, and premium-only APIs refusing free
 * users. Run the server with RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET /
 * RAZORPAY_WEBHOOK_SECRET set (any test values) for the webhook tests.
 */
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

async function webhook(request: APIRequestContext, event: string, payload: Record<string, unknown>, opts: { eventId?: string; secret?: string } = {}) {
  const body = JSON.stringify({ entity: "event", event, payload, created_at: Math.floor(Date.now() / 1000) });
  const signature = createHmac("sha256", opts.secret ?? WEBHOOK_SECRET!).update(body).digest("hex");
  return request.post("/api/premium/webhook", {
    data: body,
    headers: { "content-type": "application/json", "x-razorpay-signature": signature, "x-razorpay-event-id": opts.eventId ?? `evt_${randomUUID()}` },
  });
}

const payment = (id: string, order: string | null, amount: number, status = "captured") => ({
  payment: { entity: { id, order_id: order, amount, currency: "INR", status, method: "upi", captured: status === "captured", amount_refunded: 0, error_code: null, error_description: null, notes: [] } },
});

async function entitlements(request: APIRequestContext): Promise<string[]> {
  return (await (await request.get("/api/premium")).json()).data.entitlements;
}

test.describe("Quick Chat Premium", () => {
  test.skip(!canCreateUsers, NEEDS_USERS);
  test.setTimeout(120_000);
  let user: TestUser, other: TestUser;
  test.beforeAll(async () => {
    user = await createUser();
    other = await createUser();
  });
  test.afterAll(async () => deleteUsers(user, other));

  test("pricing page shows the three plans, prices and billing terms", async ({ page }) => {
    await login(page, user);
    await page.goto("/premium");
    const cards = page.getByTestId("pricing-cards");
    await expect(cards.locator("[data-plan=monthly]")).toContainText("₹49");
    await expect(cards.locator("[data-plan=monthly]")).toContainText("per month");
    await expect(cards.locator("[data-plan=yearly]")).toContainText("₹299");
    await expect(cards.locator("[data-plan=yearly]")).toContainText("Best value");
    await expect(cards.locator("[data-plan=lifetime]")).toContainText("₹1,999");
    await expect(cards.locator("[data-plan=lifetime]")).toContainText("No subscription and no renewals");
    await expect(page.getByText(/include all applicable taxes/)).toBeVisible();
    await expect(page.getByText(/renew automatically/)).toBeVisible();
    await expect(page.getByText(/never sees or stores your card number, CVV or UPI PIN/)).toBeVisible();
  });

  test("free users can't use premium-only APIs", async ({ page }) => {
    await login(page, other);
    expect((await page.request.get("/api/premium/analytics")).status()).toBe(403);
    expect((await page.request.post("/api/premium/theme", { data: { theme: "ocean" } })).status()).toBe(403);
    expect(await entitlements(page.request)).toEqual([]);
  });

  test.describe("webhooks", () => {
    test.skip(!WEBHOOK_SECRET || !KEY_SECRET, "Set RAZORPAY_* test values for the server");

    test("reject bad signatures and a forged checkout signature", async ({ page }) => {
      const bad = await webhook(page.request, "payment.captured", payment("pay_x", "order_x", 199900), { secret: "wrong" });
      expect(bad.status()).toBe(401);
      await login(page, other);
      const forged = await page.request.post("/api/premium/verify", { data: { orderId: "order_fake1", paymentId: "pay_fake1", signature: "0".repeat(64) } });
      expect(forged.status()).toBe(400);
      expect((await forged.json()).error.code).toBe("invalid_signature");
    });

    test("lifetime: activated once by a verified captured payment, never by duplicates or wrong amounts", async ({ page }) => {
      const order = `order_${randomUUID().slice(0, 8)}`;
      const { error } = await admin().from("payment_transactions").insert({ user_id: user.id, plan_id: "lifetime", razorpay_order_id: order, amount_paise: 199900, status: "created" });
      expect(error).toBeNull();

      // Wrong amount: refused, nothing granted.
      const wrong = await webhook(page.request, "payment.captured", payment(`pay_w${randomUUID().slice(0, 6)}`, order, 100));
      expect(wrong.status()).toBe(500);
      await login(page, user);
      expect(await entitlements(page.request)).toEqual([]);

      const eventId = `evt_${randomUUID()}`;
      const pay = `pay_${randomUUID().slice(0, 10)}`;
      expect((await webhook(page.request, "payment.captured", payment(pay, order, 199900), { eventId })).status()).toBe(200);
      const dup = await webhook(page.request, "payment.captured", payment(pay, order, 199900), { eventId });
      expect((await dup.json()).duplicate).toBe(true);
      // The same payment in a different event (order.paid) is still applied only once.
      expect((await webhook(page.request, "order.paid", payment(pay, order, 199900))).status()).toBe(200);
      const { count } = await admin().from("payment_transactions").select("*", { count: "exact", head: true }).eq("razorpay_payment_id", pay);
      expect(count).toBe(1);

      expect((await entitlements(page.request)).sort()).toEqual(["extended_uploads", "premium_badge", "premium_video_effects", "profile_analytics", "profile_themes"]);
      await page.goto("/settings/premium");
      await expect(page.getByTestId("premium-status")).toContainText("Lifetime member — no renewals");
      await expect(page.getByTestId("premium-status")).not.toContainText("Next renewal");
      await expect(page.getByTestId("transactions")).toContainText("₹1,999");
      await page.goto(`/profile/${user.username}`);
      await expect(page.getByText("Premium", { exact: true }).first()).toBeVisible();
      expect((await page.request.get("/api/premium/analytics")).status()).toBe(200);

      // Full refund ends the access it bought.
      expect((await webhook(page.request, "refund.processed", { refund: { entity: { id: "rfnd_1", payment_id: pay, amount: 199900 } } })).status()).toBe(200);
      expect(await entitlements(page.request)).toEqual([]);
    });

    test("monthly: charged → active with renewal date; cancelled → ends at period end; expiry removes access; failed renewal recorded", async ({ page }) => {
      const sub = `sub_${randomUUID().slice(0, 10)}`;
      await admin().from("user_subscriptions").insert({ user_id: other.id, plan_id: "monthly", status: "pending", razorpay_subscription_id: sub });
      const end = Math.floor(Date.now() / 1000) + 30 * 86_400;
      const subscription = (status: string) => ({ subscription: { entity: { id: sub, plan_id: "plan_x", status, current_start: Math.floor(Date.now() / 1000), current_end: end, charge_at: end, notes: [] } } });

      expect((await webhook(page.request, "subscription.charged", { ...subscription("active"), ...payment(`pay_${randomUUID().slice(0, 10)}`, null, 4900) })).status()).toBe(200);
      await login(page, other);
      expect(await entitlements(page.request)).toContain("premium_badge");
      await page.goto("/settings/premium");
      await expect(page.getByTestId("premium-status")).toContainText("Premium Monthly");
      await expect(page.getByTestId("premium-status")).toContainText("Next renewal");

      expect((await webhook(page.request, "subscription.pending", subscription("pending"))).status()).toBe(200);
      expect((await webhook(page.request, "subscription.cancelled", subscription("cancelled"))).status()).toBe(200);
      await page.reload();
      await expect(page.getByTestId("premium-status")).toContainText("Cancelled — won't renew");
      expect(await entitlements(page.request)).toContain("premium_badge");

      await admin().from("user_subscriptions").update({ access_until: new Date(Date.now() - 60_000).toISOString() }).eq("razorpay_subscription_id", sub);
      await admin().rpc("run_premium_maintenance");
      expect(await entitlements(page.request)).toEqual([]);
      const { data } = await admin().from("user_subscriptions").select("status").eq("razorpay_subscription_id", sub).single();
      expect(data?.status).toBe("expired");
    });

    test("a failed payment is recorded and grants nothing", async ({ page }) => {
      const order = `order_${randomUUID().slice(0, 8)}`;
      await admin().from("payment_transactions").insert({ user_id: other.id, plan_id: "lifetime", razorpay_order_id: order, amount_paise: 199900, status: "created" });
      const pay = `pay_${randomUUID().slice(0, 10)}`;
      expect((await webhook(page.request, "payment.failed", payment(pay, order, 199900, "failed"))).status()).toBe(200);
      const { data } = await admin().from("payment_transactions").select("status").eq("razorpay_payment_id", pay).single();
      expect(data?.status).toBe("failed");
      await login(page, other);
      expect(await entitlements(page.request)).toEqual([]);
    });
  });
});
