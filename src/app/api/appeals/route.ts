import { z } from "zod";
import { handler, unwrap } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { uuid } from "@/lib/validation";

const body = z.object({
  actionId: uuid,
  message: z.string().trim().min(10, "Please explain in at least 10 characters").max(2000),
});

/**
 * POST /api/appeals {actionId, message} → { id }
 * Suspended and banned users may appeal, so this works for inactive accounts.
 */
export const POST = handler(
  { body, allowDuringMaintenance: true, rateLimit: { name: "appeals.create", limit: 5, window: 3600 } },
  async ({ supabase, user, body }) => {
    const { data: existing } = await supabase
      .from("appeals")
      .select("id, status")
      .eq("user_id", user.id)
      .eq("moderation_action_id", body.actionId)
      .maybeSingle();
    if (existing) throw new ApiError(409, "already_appealed", "You've already appealed this decision.");
    const id = unwrap(await supabase.rpc("submit_appeal", { p_action_id: body.actionId, p_message: body.message })) as string;
    return { id };
  },
);

/** GET /api/appeals → the current user's appeals (newest first). */
export const GET = handler({}, async ({ supabase, user }) => {
  return unwrap(
    await supabase
      .from("appeals")
      .select("id, moderation_action_id, message, status, response, reviewed_at, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100),
  );
});
