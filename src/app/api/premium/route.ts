import { handler } from "@/lib/api/handler";
import { razorpayConfigured } from "@/lib/razorpay";
import { myEntitlements } from "@/lib/premium";

/**
 * GET /api/premium — plans, my subscriptions (newest first), my payment
 * history and entitlements. Subscriptions and payments are read through RLS
 * (own rows only).
 */
export const GET = handler({ rateLimit: { name: "premium.read", limit: 60, window: 60 } }, async ({ supabase }) => {
  const [plans, subs, txs, entitlements] = await Promise.all([
    supabase.from("subscription_plans").select("id, name, amount_paise, currency, billing_interval").eq("active", true).order("sort_order"),
    supabase
      .from("user_subscriptions")
      .select("id, plan_id, status, started_at, current_period_end, access_until, cancel_at_period_end, cancelled_at, created_at, razorpay_subscription_id")
      .neq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("payment_transactions")
      .select("id, plan_id, amount_paise, currency, status, method, razorpay_payment_id, error_description, refunded_paise, created_at")
      .neq("status", "created")
      .order("created_at", { ascending: false })
      .limit(50),
    myEntitlements(supabase),
  ]);
  return {
    configured: razorpayConfigured(),
    available: !plans.error,
    plans: plans.data ?? [],
    subscriptions: (subs.data ?? []).map(({ razorpay_subscription_id, ...s }) => ({ ...s, recurring: Boolean(razorpay_subscription_id) })),
    transactions: txs.data ?? [],
    entitlements,
  };
});
