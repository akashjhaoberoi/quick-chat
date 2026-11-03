import { z } from "zod";
import { handler } from "@/lib/api/handler";
import { audit } from "@/lib/premium";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * POST /api/premium/failed — Checkout reports a failed or dismissed payment.
 * Informational only (marks my own unpaid checkout); never changes access.
 */
export const POST = handler(
  {
    body: z.object({
      reason: z.enum(["failed", "cancelled"]),
      orderId: z.string().max(64).optional(),
      subscriptionId: z.string().max(64).optional(),
      code: z.string().max(100).optional(),
      description: z.string().max(500).optional(),
    }),
    rateLimit: { name: "premium.failed", limit: 20, window: 60 },
  },
  async ({ user, body }) => {
    if (body.orderId) {
      await getSupabaseAdmin()
        .from("payment_transactions")
        .update({ status: body.reason === "failed" ? "failed" : "cancelled", error_code: body.code ?? null, error_description: body.description ?? null })
        .eq("user_id", user.id)
        .eq("razorpay_order_id", body.orderId)
        .eq("status", "created");
    }
    await audit(user.id, body.reason === "failed" ? "checkout_failed" : "checkout_cancelled", {
      order: body.orderId,
      subscription: body.subscriptionId,
      code: body.code,
    });
    return { recorded: true };
  },
);
