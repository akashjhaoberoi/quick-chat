import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/lib/env";

/**
 * Minimal Razorpay REST client (https://razorpay.com/docs/api/) plus signature
 * checks. Server-only: the key secret and webhook secret never reach the
 * browser. Premium is activated only from payments fetched back from Razorpay
 * after a signature check — never from a client-side "success" callback.
 */
const API = "https://api.razorpay.com/v1";

export class RazorpayError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export function razorpayConfigured(): boolean {
  const env = serverEnv();
  return Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET && env.RAZORPAY_WEBHOOK_SECRET);
}

export function razorpayKeyId(): string {
  return serverEnv().RAZORPAY_KEY_ID ?? "";
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const env = serverEnv();
  const auth = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString("base64");
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: { code?: string; description?: string } } & T;
  if (!res.ok) {
    throw new RazorpayError(res.status, json.error?.code ?? "razorpay_error", json.error?.description ?? `Razorpay request failed (${res.status}).`);
  }
  return json;
}

export type RzpOrder = { id: string; amount: number; currency: string; status: string; receipt: string | null };
export type RzpPayment = {
  id: string;
  order_id: string | null;
  amount: number;
  currency: string;
  status: "created" | "authorized" | "captured" | "refunded" | "failed";
  method: string | null;
  captured: boolean;
  amount_refunded: number;
  error_code: string | null;
  error_description: string | null;
  notes: Record<string, string> | [];
};
export type RzpSubscription = {
  id: string;
  plan_id: string;
  status: "created" | "authenticated" | "active" | "pending" | "halted" | "cancelled" | "completed" | "expired" | "paused";
  current_start: number | null;
  current_end: number | null;
  charge_at: number | null;
  notes: Record<string, string> | [];
};
export type RzpPlan = { id: string };

export const createOrder = (amount: number, currency: string, receipt: string, notes: Record<string, string>) =>
  call<RzpOrder>("POST", "/orders", { amount, currency, receipt, notes, payment_capture: 1 });

export const fetchPayment = (id: string) => call<RzpPayment>("GET", `/payments/${encodeURIComponent(id)}`);

export const fetchOrderPayments = (orderId: string) =>
  call<{ items: RzpPayment[] }>("GET", `/orders/${encodeURIComponent(orderId)}/payments`).then((r) => r.items);

export const createPlan = (period: "monthly" | "yearly", amount: number, currency: string, name: string) =>
  call<RzpPlan>("POST", "/plans", { period, interval: 1, item: { name, amount, currency } });

export const createSubscription = (planId: string, totalCount: number, notes: Record<string, string>) =>
  call<RzpSubscription>("POST", "/subscriptions", { plan_id: planId, total_count: totalCount, customer_notify: 1, notes });

export const fetchSubscription = (id: string) => call<RzpSubscription>("GET", `/subscriptions/${encodeURIComponent(id)}`);

export const cancelSubscription = (id: string, atCycleEnd: boolean) =>
  call<RzpSubscription>("POST", `/subscriptions/${encodeURIComponent(id)}/cancel`, { cancel_at_cycle_end: atCycleEnd ? 1 : 0 });

function hmac(secret: string, data: string): string {
  return createHmac("sha256", secret).update(data).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Checkout signature for orders: HMAC_SHA256(order_id + "|" + payment_id, key_secret). */
export function verifyOrderSignature(orderId: string, paymentId: string, signature: string, secret = serverEnv().RAZORPAY_KEY_SECRET ?? ""): boolean {
  return Boolean(secret) && safeEqual(hmac(secret, `${orderId}|${paymentId}`), signature);
}

/** Checkout signature for subscriptions: HMAC_SHA256(payment_id + "|" + subscription_id, key_secret). */
export function verifySubscriptionSignature(
  paymentId: string,
  subscriptionId: string,
  signature: string,
  secret = serverEnv().RAZORPAY_KEY_SECRET ?? "",
): boolean {
  return Boolean(secret) && safeEqual(hmac(secret, `${paymentId}|${subscriptionId}`), signature);
}

/** Webhook signature: HMAC_SHA256(raw body, webhook_secret) in X-Razorpay-Signature. */
export function verifyWebhookSignature(rawBody: string, signature: string, secret = serverEnv().RAZORPAY_WEBHOOK_SECRET ?? ""): boolean {
  return Boolean(secret) && Boolean(signature) && safeEqual(hmac(secret, rawBody), signature);
}

/** Razorpay subscription period end (unix seconds) as an ISO string. */
export function periodEnd(sub: Pick<RzpSubscription, "current_end" | "charge_at">): string | null {
  const t = sub.current_end ?? sub.charge_at;
  return t ? new Date(t * 1000).toISOString() : null;
}
