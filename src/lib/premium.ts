import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ApiError } from "@/lib/api/errors";
import { log } from "@/lib/log";
import type { Entitlement, PlanId } from "@/lib/premium-plans";
import {
  cancelSubscription,
  createPlan,
  fetchPayment,
  fetchSubscription,
  periodEnd,
  razorpayConfigured,
  RazorpayError,
  type RzpPayment,
} from "@/lib/razorpay";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type PlanRow = { id: PlanId; name: string; amount_paise: number; currency: string; billing_interval: "month" | "year" | "lifetime"; razorpay_plan_id: string | null };

/** The caller's entitlements, decided by the database (private.has_entitlement). */
export async function myEntitlements(supabase: SupabaseClient): Promise<Entitlement[]> {
  const { data, error } = await supabase.rpc("my_entitlements");
  if (error) {
    // Before the Premium migration is applied everyone is on the free tier.
    log("warn", "entitlements_unavailable", { error: error.message });
    return [];
  }
  return ((data ?? []) as { entitlement: Entitlement }[]).map((r) => r.entitlement);
}

export async function hasEntitlement(supabase: SupabaseClient, key: Entitlement): Promise<boolean> {
  return (await myEntitlements(supabase)).includes(key);
}

export function requirePayments() {
  if (!razorpayConfigured()) {
    throw new ApiError(503, "payments_not_configured", "Payments aren't set up yet. Please try again later.");
  }
}

export async function getPlan(id: PlanId): Promise<PlanRow> {
  const { data } = await getSupabaseAdmin().from("subscription_plans").select("*").eq("id", id).eq("active", true).maybeSingle();
  if (!data) throw new ApiError(404, "plan_not_found", "That plan isn't available.");
  return data as PlanRow;
}

/** Creates the Razorpay plan for a recurring tier on first use and stores its id. */
export async function ensureRazorpayPlan(plan: PlanRow): Promise<string> {
  if (plan.razorpay_plan_id) return plan.razorpay_plan_id;
  const created = await createPlan(plan.billing_interval === "month" ? "monthly" : "yearly", plan.amount_paise, plan.currency, `Quick Chat Premium — ${plan.name}`);
  await getSupabaseAdmin().from("subscription_plans").update({ razorpay_plan_id: created.id }).eq("id", plan.id).is("razorpay_plan_id", null);
  const { data } = await getSupabaseAdmin().from("subscription_plans").select("razorpay_plan_id").eq("id", plan.id).single();
  return (data?.razorpay_plan_id as string) ?? created.id;
}

export async function audit(userId: string | null, action: string, details: Record<string, unknown>, actorId: string | null = null) {
  const { error } = await getSupabaseAdmin().from("payment_audit_logs").insert({ user_id: userId, actor_id: actorId, action, details });
  if (error) log("warn", "payment_audit_failed", { error: error.message, action });
}

type ApplyArgs = {
  userId: string;
  plan: PlanId;
  payment: RzpPayment;
  orderId?: string | null;
  subscriptionId?: string | null;
  periodEnd?: string | null;
  source: "checkout" | "webhook" | "reconcile";
};

/** Applies a payment fetched from Razorpay. Idempotent per payment id. */
export async function applyPayment(a: ApplyArgs): Promise<{ activated: boolean; status: string; duplicate?: boolean }> {
  const status = a.payment.status === "captured" ? "captured" : a.payment.status === "failed" ? "failed" : a.payment.status === "authorized" ? "authorized" : null;
  if (!status) return { activated: false, status: a.payment.status };
  if (status === "authorized") {
    // Auto-capture is on; the webhook (payment.captured) finishes activation.
    return { activated: false, status: "processing" };
  }
  const { data, error } = await getSupabaseAdmin().rpc("premium_apply_payment", {
    p_user: a.userId,
    p_plan: a.plan,
    p_payment_id: a.payment.id,
    p_order_id: a.orderId ?? a.payment.order_id ?? null,
    p_subscription_id: a.subscriptionId ?? null,
    p_amount: a.payment.amount,
    p_currency: a.payment.currency,
    p_status: status,
    p_method: a.payment.method,
    p_period_end: a.periodEnd ?? null,
    p_source: a.source,
  });
  if (error) {
    log("error", "premium_apply_failed", { error: error.message, payment: a.payment.id });
    throw new ApiError(400, error.message.match(/^[a-z_]+$/) ? error.message : "payment_not_applied", "We couldn't confirm this payment. If you were charged, it will be refunded or applied automatically — contact support if not.");
  }
  const result = data as { activated?: boolean; duplicate?: boolean; status?: string };
  if (result.activated && a.plan === "lifetime") await cancelOtherRecurring(a.userId);
  return { activated: Boolean(result.activated || result.duplicate), status: result.duplicate ? "active" : (result.status ?? "active"), duplicate: result.duplicate };
}

/** A lifetime purchase ends any running monthly/yearly subscription at its cycle end. */
async function cancelOtherRecurring(userId: string) {
  const admin = getSupabaseAdmin();
  const { data } = await admin
    .from("user_subscriptions")
    .select("id, razorpay_subscription_id")
    .eq("user_id", userId)
    .in("status", ["active", "halted"])
    .neq("plan_id", "lifetime");
  for (const row of data ?? []) {
    try {
      if (row.razorpay_subscription_id) await cancelSubscription(row.razorpay_subscription_id, true);
      await admin.from("user_subscriptions").update({ status: "cancelled", cancel_at_period_end: true, cancelled_at: new Date().toISOString() }).eq("id", row.id);
      await audit(userId, "recurring_cancelled_after_lifetime", { subscription: row.razorpay_subscription_id });
    } catch (err) {
      log("error", "cancel_after_lifetime_failed", { error: (err as Error).message, subscription: row.razorpay_subscription_id });
    }
  }
}

/** Re-checks a payment with Razorpay and applies it (admin reconciliation). */
export async function reconcilePayment(paymentId: string): Promise<{ status: string; activated: boolean }> {
  const admin = getSupabaseAdmin();
  const payment = await fetchPayment(paymentId);
  const { data: tx } = await admin
    .from("payment_transactions")
    .select("user_id, plan_id, razorpay_order_id, razorpay_subscription_id")
    .or(`razorpay_payment_id.eq.${paymentId}${payment.order_id ? `,razorpay_order_id.eq.${payment.order_id}` : ""}`)
    .limit(1)
    .maybeSingle();
  if (!tx) throw new ApiError(404, "transaction_not_found", "No Quick Chat checkout matches this payment.");
  let end: string | null = null;
  if (tx.razorpay_subscription_id) end = periodEnd(await fetchSubscription(tx.razorpay_subscription_id));
  if (payment.amount_refunded > 0) {
    await admin.rpc("premium_apply_refund", { p_payment_id: paymentId, p_refunded_paise: payment.amount_refunded });
    return { status: payment.amount_refunded >= payment.amount ? "refunded" : "partially_refunded", activated: false };
  }
  return applyPayment({
    userId: tx.user_id,
    plan: tx.plan_id as PlanId,
    payment,
    orderId: tx.razorpay_order_id,
    subscriptionId: tx.razorpay_subscription_id,
    periodEnd: end,
    source: "reconcile",
  });
}

export function razorpayFailure(err: unknown): never {
  if (err instanceof RazorpayError) {
    log("error", "razorpay_request_failed", { status: err.status, code: err.code, message: err.message });
    throw new ApiError(502, "payment_provider_error", "The payment provider couldn't process this request. Please try again.");
  }
  throw err;
}
