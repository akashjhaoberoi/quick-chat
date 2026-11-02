import { z } from "zod";
import { handler, unwrap } from "@/lib/api/handler";
import { uuid } from "@/lib/validation";
import { reasonSchema } from "../../../_lib/shared";

const body = z.object({ reason: reasonSchema, reportId: uuid.optional() });

/** POST /api/admin/users/{id}/warn — send a community-guidelines warning (rpc admin_warn_user). */
export const POST = handler(
  { auth: { admin: "moderator" }, body, rateLimit: { name: "admin.warn", limit: 60, window: 60 } },
  async ({ supabase, params, body }) => {
    const id = uuid.parse(params.id);
    const actionId = unwrap(
      await supabase.rpc("admin_warn_user", { p_user_id: id, p_reason: body.reason, p_report_id: body.reportId ?? null }),
    ) as string;
    return { actionId };
  },
);
