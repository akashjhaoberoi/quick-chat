import { z } from "zod";
import { handler } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { audit, ensureRazorpayPlan, getPlan, razorpayFailure, requirePayments } from "@/lib/premium";
import { createOrder, createSubscription, razorpayKeyId } from "@/lib/razorpay";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

const body = z.object({ planId: z.enum(["monthly", "yearly", "lifetime"]) });

/**
 * POST /api/premium/checkout { planId } — creates the Razorpay order
 * (lifetime, one-time) or subscription (monthly/yearly, recurring) on the
 * server, with the amount from the database. Returns Checkout options.
 */
export const POST = handler({ body, rateLimit: { name: "premium.checkout", limit: 10, window: 60 } }, async ({ user, body }) => {
  requirePayments();
  const admin = getSupabaseAdmin();
  const plan = await getPlan(body.planId);

  const { data: current } = await admin
    .from("user_subscriptions")
    .select("plan_id, status, access_until, razorpay_subscription_id, created_at")
    .eq("user_id", user.id)
    .in("status", ["active", "cancelled", "halted", "pending"])
    .order("created_at", { ascending: false });
  const live = (current ?? []).filter(
    (s) => s.status !== "pending" && (s.plan_id === "lifetime" ? s.status === "active" : Boolean(s.access_until) && new Date(s.access_until).getTime() > Date.now()),
  );
  if (live.some((s) => s.plan_id === "lifetime")) throw new ApiError(409, "already_lifetime", "You already have lifetime Premium.");
  if (plan.id !== "lifetime" && live.some((s) => s.status === "active" || s.status === "halted")) {
    throw new ApiError(409, "already_subscribed", "You already have an active Premium subscription. Cancel it first, or upgrade to Lifetime.");
  }

  const { data: profile } = await admin.from("profiles").select("display_name, username").eq("id", user.id).single();
  const prefill = { name: profile?.display_name || profile?.username || "", email: user.email ?? "" };
  const notes = { user_id: user.id, plan_id: plan.id };

  try {
    if (plan.id === "lifetime") {
      // Reuse a recent unpaid order instead of creating duplicates.
      const { data: open } = await admin
        .from("payment_transactions")
        .select("razorpay_order_id")
        .eq("user_id", user.id)
        .eq("plan_id", "lifetime")
        .eq("status", "created")
        .gte("created_at", new Date(Date.now() - 30 * 60_000).toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      let orderId = open?.razorpay_order_id as string | undefined;
      if (!orderId) {
        const order = await createOrder(plan.amount_paise, plan.currency, `qc_${user.id.slice(0, 8)}_${Date.now()}`, notes);
        orderId = order.id;
        await admin.from("payment_transactions").insert({
          user_id: user.id,
          plan_id: plan.id,
          razorpay_order_id: order.id,
          amount_paise: plan.amount_paise,
          currency: plan.currency,
          status: "created",
        });
        await audit(user.id, "checkout_created", { plan: plan.id, order: order.id });
      }
      return { mode: "order" as const, keyId: razorpayKeyId(), orderId, amount: plan.amount_paise, currency: plan.currency, planId: plan.id, prefill };
    }

    const pending = (current ?? []).find(
      (s) => s.status === "pending" && s.plan_id === plan.id && s.razorpay_subscription_id && Date.now() - new Date(s.created_at).getTime() < 30 * 60_000,
    );
    let subscriptionId = pending?.razorpay_subscription_id as string | undefined;
    if (!subscriptionId) {
      const rzpPlan = await ensureRazorpayPlan(plan);
      // Razorpay needs a cycle count: about ten years of renewals either way.
      const sub = await createSubscription(rzpPlan, plan.billing_interval === "month" ? 120 : 10, notes);
      subscriptionId = sub.id;
      await admin.from("user_subscriptions").insert({ user_id: user.id, plan_id: plan.id, status: "pending", razorpay_subscription_id: sub.id });
      await audit(user.id, "checkout_created", { plan: plan.id, subscription: sub.id });
    }
    return { mode: "subscription" as const, keyId: razorpayKeyId(), subscriptionId, amount: plan.amount_paise, currency: plan.currency, planId: plan.id, prefill };
  } catch (err) {
    return razorpayFailure(err);
  }
});
