import { handler, unwrap } from "@/lib/api/handler";
import { uuid } from "@/lib/validation";

/**
 * GET /api/admin/users/{id}/sessions — login activity (admin+). The access is
 * recorded in the audit log before any data is returned.
 */
export const GET = handler({ auth: { admin: "admin" } }, async ({ supabase, params }) => {
  const id = uuid.parse(params.id);
  unwrap(await supabase.rpc("admin_log_access", { p_action: "view_login_activity", p_target_type: "user", p_target_id: id }));
  return (
    unwrap(
      await supabase
        .from("user_sessions")
        .select("id, session_id, event, ip, user_agent, device, created_at")
        .eq("user_id", id)
        .order("created_at", { ascending: false })
        .limit(100),
    ) ?? []
  );
});
