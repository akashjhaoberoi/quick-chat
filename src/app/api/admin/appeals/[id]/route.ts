import { z } from "zod";
import { handler, unwrap } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { uuid } from "@/lib/validation";
import { syncAuthBan } from "../../_lib/shared";

const body = z.object({
  accept: z.boolean(),
  response: z.string().trim().min(3, "Write a short response to the user").max(1000),
});

/**
 * POST /api/admin/appeals/{id} — accept or reject an appeal (rpc admin_review_appeal).
 * Accepting a suspension/ban appeal also lifts the sign-in block at the Auth layer.
 */
export const POST = handler(
  { auth: { admin: "moderator" }, body, rateLimit: { name: "admin.appeal", limit: 60, window: 60 } },
  async ({ supabase, params, body, user }) => {
    const id = uuid.parse(params.id);
    const appeal = unwrap(
      await supabase
        .from("appeals")
        .select("user_id, action:moderation_actions!appeals_moderation_action_id_fkey(action)")
        .eq("id", id)
        .maybeSingle(),
    ) as unknown as { user_id: string; action: { action: string } | null } | null;
    if (!appeal) throw new ApiError(404, "appeal_not_found", "Appeal not found.");
    unwrap(await supabase.rpc("admin_review_appeal", { p_appeal_id: id, p_accept: body.accept, p_response: body.response }));
    let authSync: string | null = null;
    if (body.accept && (appeal.action?.action === "suspend" || appeal.action?.action === "ban")) {
      authSync = await syncAuthBan(supabase, appeal.user_id, "active", null, user.id);
    }
    return { status: body.accept ? "accepted" : "rejected", authSync };
  },
);
