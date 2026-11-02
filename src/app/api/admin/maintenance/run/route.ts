import { handler, requireIntegration, unwrap } from "@/lib/api/handler";
import { getSupabaseAdmin, hasServiceRole } from "@/lib/supabase/admin";

/**
 * POST /api/admin/maintenance/run — run the maintenance job immediately (admin+).
 * run_maintenance is service-role only; the run is recorded in job_runs by the
 * function itself and in the admin audit log via admin_log_access.
 */
export const POST = handler(
  { auth: { admin: "admin" }, rateLimit: { name: "admin.maintenance", limit: 6, window: 60 } },
  async ({ supabase }) => {
    requireIntegration(hasServiceRole(), "The Supabase service role key");
    // Audit first so the attempt is recorded even if the job fails.
    unwrap(await supabase.rpc("admin_log_access", { p_action: "run_maintenance", p_target_type: "system", p_target_id: "maintenance" }));
    const result = unwrap(await getSupabaseAdmin().rpc("run_maintenance"));
    return { result };
  },
);
