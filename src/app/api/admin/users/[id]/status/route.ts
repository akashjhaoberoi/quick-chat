import { z } from "zod";
import { handler, unwrap } from "@/lib/api/handler";
import { uuid } from "@/lib/validation";
import { reasonSchema, syncAuthBan } from "../../../_lib/shared";

const body = z
  .object({
    status: z.enum(["active", "suspended", "banned"]),
    reason: reasonSchema,
    days: z.coerce.number().int().min(1).max(365).optional(),
    reportId: uuid.optional(),
  })
  .refine((b) => b.status !== "suspended" || b.days !== undefined, { message: "Choose a suspension length", path: ["days"] });

/**
 * POST /api/admin/users/{id}/status — suspend (moderator+), ban (admin+, enforced
 * by the RPC) or restore a user. After the audited RPC succeeds the change is
 * mirrored to Supabase Auth so a suspended/banned user cannot sign in.
 */
export const POST = handler(
  { auth: { admin: "moderator" }, body, rateLimit: { name: "admin.status", limit: 60, window: 60 } },
  async ({ supabase, params, body, user }) => {
    const id = uuid.parse(params.id);
    const actionId = unwrap(
      await supabase.rpc("admin_set_user_status", {
        p_user_id: id,
        p_status: body.status,
        p_reason: body.reason,
        p_days: body.status === "suspended" ? body.days : null,
        p_report_id: body.reportId ?? null,
      }),
    ) as string;
    const authSync = await syncAuthBan(supabase, id, body.status, body.days, user.id);
    return { actionId, authSync };
  },
);
