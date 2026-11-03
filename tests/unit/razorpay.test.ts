import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { periodEnd, verifyOrderSignature, verifySubscriptionSignature, verifyWebhookSignature } from "@/lib/razorpay";
import { PLANS } from "@/lib/premium-plans";

const SECRET = "test_key_secret";
const sign = (data: string, secret = SECRET) => createHmac("sha256", secret).update(data).digest("hex");

describe("Razorpay signatures (as documented by Razorpay)", () => {
  it("order checkout: HMAC(order_id|payment_id)", () => {
    const sig = sign("order_ABC|pay_XYZ");
    expect(verifyOrderSignature("order_ABC", "pay_XYZ", sig, SECRET)).toBe(true);
    expect(verifyOrderSignature("order_ABC", "pay_OTHER", sig, SECRET)).toBe(false);
    expect(verifyOrderSignature("order_ABC", "pay_XYZ", sign("order_ABC|pay_XYZ", "wrong"), SECRET)).toBe(false);
    expect(verifyOrderSignature("order_ABC", "pay_XYZ", "short", SECRET)).toBe(false);
  });

  it("subscription checkout: HMAC(payment_id|subscription_id)", () => {
    const sig = sign("pay_XYZ|sub_123");
    expect(verifySubscriptionSignature("pay_XYZ", "sub_123", sig, SECRET)).toBe(true);
    expect(verifySubscriptionSignature("sub_123", "pay_XYZ", sig, SECRET)).toBe(false);
  });

  it("webhooks: HMAC(raw body) with the webhook secret; any change to the body fails", () => {
    const body = JSON.stringify({ event: "payment.captured", payload: { payment: { entity: { id: "pay_1", amount: 4900 } } } });
    const sig = sign(body, "whsec");
    expect(verifyWebhookSignature(body, sig, "whsec")).toBe(true);
    expect(verifyWebhookSignature(body.replace("4900", "1"), sig, "whsec")).toBe(false);
    expect(verifyWebhookSignature(body, "", "whsec")).toBe(false);
  });

  it("refuses everything when no secret is configured", () => {
    expect(verifyOrderSignature("order_ABC", "pay_XYZ", sign("order_ABC|pay_XYZ", ""), "")).toBe(false);
    expect(verifyWebhookSignature("{}", sign("{}", ""), "")).toBe(false);
  });

  it("converts the subscription period end from unix seconds", () => {
    expect(periodEnd({ current_end: 1_800_000_000, charge_at: null })).toBe(new Date(1_800_000_000_000).toISOString());
    expect(periodEnd({ current_end: null, charge_at: null })).toBeNull();
  });
});

describe("plan display copy", () => {
  it("matches the agreed prices; lifetime is one-time", () => {
    expect(PLANS.map((p) => [p.id, p.amountPaise, p.price])).toEqual([
      ["monthly", 4900, "₹49"],
      ["yearly", 29900, "₹299"],
      ["lifetime", 199900, "₹1,999"],
    ]);
    expect(PLANS.find((p) => p.id === "lifetime")!.terms).toMatch(/No subscription and no renewals/);
  });
});
