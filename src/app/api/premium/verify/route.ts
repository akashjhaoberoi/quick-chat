import { z } from "zod";
import { handler } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { applyPayment, audit, razorpayFailure, requirePayments } from "@/lib/premium";
import type { PlanId } from "@/lib/premium-plans";
import { fetchPayment, fetchSubscription, periodEnd, verifyOrderSignature, verifySubscriptionSignature } from "@/lib/razorpay";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const id = z.string().min(5).max(64).regex(/^[A-Za-z0-9_]+$/);
const signature = z.string().min(10).max(256);
const body = z.union([
  z.object({ orderId: id, paymentId: id, signature }),
  z.object({ subscriptionId: id, paymentId: id, signature }),
]);

/**
 * POST /api/premium/verify — Checkout's success callback. The signature is
 * checked with the key secret, then the payment (and subscription) is fetched
 * back from Razorpay; only a captured payment of the right amount activates
 * Premium. The browser's word alone is never enough.
 */
export const POST = handler({ body, rateLimit: { name: "premium.verify", limit: 20, window: 60 } }, async ({ user, body }) => {
  requirePayments();
  const admin = getSupabaseAdmin();
  try {
    if ("orderId" in body) {
      if (!verifyOrderSignature(body.orderId, body.paymentId, body.signature)) {
        await audit(user.id, "signature_invalid", { order: body.orderId, payment: body.paymentId });
        throw new ApiError(400, "invalid_signature", "We couldn't verify this payment.");
      }
      const { data: tx } = await admin
        .from("payment_transactions")
        .select("plan_id")
        .eq("user_id", user.id)
        .eq("razorpay_order_id", body.orderId)
        .limit(1)
        .maybeSingle();
      if (!tx) throw new ApiError(404, "checkout_not_found", "This checkout wasn't started from your account.");
      const payment = await fetchPayment(body.paymentId);
      if (payment.order_id !== body.orderId) throw new ApiError(400, "invalid_payment", "This payment doesn't belong to this checkout.");
      return await applyPayment({ userId: user.id, plan: tx.plan_id as PlanId, payment, orderId: body.orderId, source: "checkout" });
    }

    if (!verifySubscriptionSignature(body.paymentId, body.subscriptionId, body.signature)) {
      await audit(user.id, "signature_invalid", { subscription: body.subscriptionId, payment: body.paymentId });
      throw new ApiError(400, "invalid_signature", "We couldn't verify this payment.");
    }
    const { data: sub } = await admin
      .from("user_subscriptions")
      .select("plan_id")
      .eq("user_id", user.id)
      .eq("razorpay_subscription_id", body.subscriptionId)
      .maybeSingle();
    if (!sub) throw new ApiError(404, "checkout_not_found", "This subscription wasn't started from your account.");
    const [payment, rzpSub] = await Promise.all([fetchPayment(body.paymentId), fetchSubscription(body.subscriptionId)]);
    return await applyPayment({
      userId: user.id,
      plan: sub.plan_id as PlanId,
      payment,
      subscriptionId: body.subscriptionId,
      periodEnd: periodEnd(rzpSub),
      source: "checkout",
    });
  } catch (err) {
    return razorpayFailure(err);
  }
});
