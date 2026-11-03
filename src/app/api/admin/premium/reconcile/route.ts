import { z } from "zod";
import { handler } from "@/lib/api/handler";
import { audit, razorpayFailure, reconcilePayment, requirePayments } from "@/lib/premium";

/** POST /api/admin/premium/reconcile { paymentId } — re-fetch a payment from Razorpay and apply its real status. */
export const POST = handler(
  {
    auth: { admin: "admin" },
    body: z.object({ paymentId: z.string().regex(/^pay_[A-Za-z0-9]+$/) }),
    rateLimit: { name: "admin.premium.reconcile", limit: 30, window: 60 },
  },
  async ({ user, body }) => {
    requirePayments();
    try {
      const result = await reconcilePayment(body.paymentId);
      await audit(null, "admin_reconcile", { payment: body.paymentId, result }, user.id);
      return result;
    } catch (err) {
      return razorpayFailure(err);
    }
  },
);
