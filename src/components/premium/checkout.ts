"use client";

import { api } from "@/lib/api/client";
import type { PlanId } from "@/lib/premium-plans";

type CheckoutStart = {
  mode: "order" | "subscription";
  keyId: string;
  orderId?: string;
  subscriptionId?: string;
  amount: number;
  currency: string;
  planId: PlanId;
  prefill: { name: string; email: string };
};

type RazorpaySuccess = {
  razorpay_payment_id: string;
  razorpay_order_id?: string;
  razorpay_subscription_id?: string;
  razorpay_signature: string;
};

type RazorpayInstance = { open: () => void; on: (event: "payment.failed", cb: (r: { error: { code?: string; description?: string } }) => void) => void };
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayInstance;
  }
}

export type CheckoutResult =
  | { outcome: "activated" }
  | { outcome: "processing" }
  | { outcome: "cancelled" }
  | { outcome: "failed"; message: string };

let scriptPromise: Promise<void> | null = null;

/** Loads Razorpay's official Checkout script once. */
function loadCheckout(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error("Couldn't load the payment window. Check your connection and try again."));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

/**
 * Creates the order/subscription on the server, opens Razorpay Checkout and
 * sends the result back for server-side verification. Payment methods (UPI,
 * cards, net banking, wallets) are whatever the merchant account has enabled.
 */
export async function startCheckout(planId: PlanId): Promise<CheckoutResult> {
  const start = await api.post<CheckoutStart>("/api/premium/checkout", { planId });
  await loadCheckout();
  if (!window.Razorpay) return { outcome: "failed", message: "The payment window isn't available." };

  return new Promise<CheckoutResult>((resolve) => {
    let settled = false;
    const finish = (r: CheckoutResult) => {
      if (!settled) {
        settled = true;
        resolve(r);
      }
    };
    const rzp = new window.Razorpay!({
      key: start.keyId,
      name: "Quick Chat Premium",
      description: start.planId === "lifetime" ? "Lifetime — one-time payment" : start.planId === "yearly" ? "Yearly subscription" : "Monthly subscription",
      ...(start.mode === "order" ? { order_id: start.orderId, amount: start.amount, currency: start.currency } : { subscription_id: start.subscriptionId }),
      prefill: { name: start.prefill.name, email: start.prefill.email },
      theme: { color: "#FF9F43" },
      handler: async (res: RazorpaySuccess) => {
        try {
          const verified = await api.post<{ activated: boolean; status: string }>(
            "/api/premium/verify",
            res.razorpay_subscription_id
              ? { subscriptionId: res.razorpay_subscription_id, paymentId: res.razorpay_payment_id, signature: res.razorpay_signature }
              : { orderId: res.razorpay_order_id, paymentId: res.razorpay_payment_id, signature: res.razorpay_signature },
          );
          finish(verified.activated ? { outcome: "activated" } : { outcome: "processing" });
        } catch (err) {
          finish({ outcome: "failed", message: (err as Error).message || "We couldn't confirm your payment." });
        }
      },
      modal: {
        ondismiss: () => {
          if (settled) return;
          void api.post("/api/premium/failed", { reason: "cancelled", orderId: start.orderId, subscriptionId: start.subscriptionId }).catch(() => undefined);
          finish({ outcome: "cancelled" });
        },
      },
    });
    rzp.on("payment.failed", (r) => {
      void api
        .post("/api/premium/failed", {
          reason: "failed",
          orderId: start.orderId,
          subscriptionId: start.subscriptionId,
          code: r.error.code?.slice(0, 100),
          description: r.error.description?.slice(0, 500),
        })
        .catch(() => undefined);
      // Razorpay keeps its window open so the user can retry with another method.
    });
    rzp.open();
  });
}
