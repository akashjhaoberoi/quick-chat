import { handler, unwrap } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { uuid } from "@/lib/validation";
import { PROFILE } from "../../_lib/shared";

/**
 * GET /api/admin/users/{id} — profile, status, role, report count, moderation
 * history and reports filed against the user. Never touches private messages.
 */
export const GET = handler({ auth: { admin: "moderator" } }, async ({ supabase, params }) => {
  const id = uuid.parse(params.id);
  const [summary, profile, actions, reports] = await Promise.all([
    supabase.rpc("admin_search_users", { p_query: id, p_status: null, p_limit: 5, p_offset: 0 }),
    supabase
      .from("profiles")
      .select("bio, is_private, is_verified, is_creator, cover_media_id")
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("moderation_actions")
      .select(`*, moderator:profiles!moderation_actions_moderator_id_fkey(${PROFILE})`)
      .eq("target_user_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("reports")
      .select(`id, target_type, reason, status, created_at, reporter:profiles!reports_reporter_id_fkey(${PROFILE})`)
      .eq("target_user_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  const rows = (unwrap(summary) ?? []) as { id: string }[];
  const row = rows.find((r) => r.id === id);
  const extra = unwrap(profile);
  if (!row || !extra) throw new ApiError(404, "user_not_found", "That user could not be found.");
  return {
    user: { ...row, ...extra },
    actions: unwrap(actions) ?? [],
    reports: unwrap(reports) ?? [],
  };
});
