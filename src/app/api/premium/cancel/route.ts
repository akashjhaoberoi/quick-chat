import { handler } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { audit, razorpayFailure, requirePayments } from "@/lib/premium";
import { cancelSubscription } from "@/lib/razorpay";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * POST /api/premium/cancel — stops renewals of my monthly/yearly plan.
 * Premium stays on until the end of the period already paid for.
 */
export const POST = handler({ rateLimit: { name: "premium.cancel", limit: 5, window: 60 } }, async ({ user }) => {
  requirePayments();
  const admin = getSupabaseAdmin();
  const { data: sub } = await admin
    .from("user_subscriptions")
    .select("id, razorpay_subscription_id, access_until")
    .eq("user_id", user.id)
    .in("status", ["active", "halted"])
    .neq("plan_id", "lifetime")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!sub?.razorpay_subscription_id) throw new ApiError(404, "no_subscription", "You don't have a renewing subscription.");
  try {
    await cancelSubscription(sub.razorpay_subscription_id, true);
  } catch (err) {
    razorpayFailure(err);
  }
  await admin
    .from("user_subscriptions")
    .update({ status: "cancelled", cancel_at_period_end: true, cancelled_at: new Date().toISOString() })
    .eq("id", sub.id);
  await audit(user.id, "subscription_cancelled", { subscription: sub.razorpay_subscription_id });
  return { cancelled: true, accessUntil: sub.access_until };
});
