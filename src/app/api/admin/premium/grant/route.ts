import { z } from "zod";
import { handler, unwrap } from "@/lib/api/handler";
import { uuid } from "@/lib/validation";

/** POST /api/admin/premium/grant { userId, grant, reason } — complimentary Premium or revoke (admin_set_premium; audited). */
export const POST = handler(
  {
    auth: { admin: "admin" },
    body: z.object({ userId: uuid, grant: z.boolean(), reason: z.string().trim().min(3).max(500) }),
    rateLimit: { name: "admin.premium.grant", limit: 30, window: 60 },
  },
  async ({ supabase, body }) => {
    unwrap(await supabase.rpc("admin_set_premium", { p_user_id: body.userId, p_grant: body.grant, p_reason: body.reason }));
    return { ok: true };
  },
);
