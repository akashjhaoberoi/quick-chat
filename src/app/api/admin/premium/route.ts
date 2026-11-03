import { z } from "zod";
import { handler, unwrap } from "@/lib/api/handler";
import { razorpayConfigured } from "@/lib/razorpay";

/**
 * GET /api/admin/premium?status= — Premium counters (admin_premium_stats) and
 * recent transactions/subscriptions. Admin role; reads go through RLS, which
 * lets admins see every row.
 */
export const GET = handler(
  {
    auth: { admin: "admin" },
    query: z.object({ status: z.enum(["captured", "failed", "refunded", "partially_refunded", "cancelled", "authorized"]).optional() }),
  },
  async ({ supabase, query }) => {
    let txq = supabase
      .from("payment_transactions")
      .select("id, user_id, plan_id, amount_paise, currency, status, method, razorpay_order_id, razorpay_payment_id, refunded_paise, error_description, created_at, profile:profiles!payment_transactions_user_id_fkey(username)")
      .neq("status", "created")
      .order("created_at", { ascending: false })
      .limit(100);
    if (query.status) txq = txq.eq("status", query.status);
    const [stats, txs, subs] = await Promise.all([
      supabase.rpc("admin_premium_stats"),
      txq,
      supabase
        .from("user_subscriptions")
        .select("id, user_id, plan_id, status, access_until, cancel_at_period_end, granted_by, created_at, profile:profiles!user_subscriptions_user_id_fkey(username)")
        .neq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    return { configured: razorpayConfigured(), stats: unwrap(stats), transactions: unwrap(txs) ?? [], subscriptions: unwrap(subs) ?? [] };
  },
);
