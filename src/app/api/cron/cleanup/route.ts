import { handler, requireIntegration } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { getSupabaseAdmin, hasServiceRole } from "@/lib/supabase/admin";
import { deleteObjects, type StorageProvider } from "@/lib/storage";
import { dispatchPush } from "@/lib/push";
import { log } from "@/lib/log";

export const maxDuration = 60;

/**
 * Scheduled job (Vercel Cron → GET with `Authorization: Bearer $CRON_SECRET`).
 *  1. Runs DB maintenance (expiry enforcement) — also scheduled via pg_cron.
 *  2. Deletes storage objects for media marked pending_delete.
 *  3. Sweeps any notifications whose push was not dispatched inline.
 */
export const GET = handler({ auth: "cron" }, async () => {
  requireIntegration(hasServiceRole(), "SUPABASE_SERVICE_ROLE_KEY");
  const admin = getSupabaseAdmin();

  const { data: maintenance, error } = await admin.rpc("run_maintenance");
  if (error) throw new ApiError(500, "maintenance_failed", error.message);

  const { data: pending } = await admin
    .from("media_assets")
    .select("id, provider, object_key")
    .eq("status", "pending_delete")
    .lte("delete_after", new Date().toISOString())
    .limit(1000);

  let deleted = 0;
  const failures: string[] = [];
  for (const provider of ["r2", "supabase"] as StorageProvider[]) {
    const rows = (pending ?? []).filter((r) => r.provider === provider);
    if (rows.length === 0) continue;
    try {
      await deleteObjects(provider, rows.map((r) => r.object_key));
      await admin.from("media_assets").update({ status: "deleted" }).in("id", rows.map((r) => r.id));
      deleted += rows.length;
    } catch (err) {
      failures.push(`${provider}: ${(err as Error).message}`);
    }
  }

  const push = await dispatchPush().catch(() => ({ sent: 0, failed: 0 }));
  await admin.from("job_runs").insert({
    job: "storage_cleanup",
    status: failures.length ? "failed" : "succeeded",
    details: { deleted, failures, push },
    finished_at: new Date().toISOString(),
  });
  log("info", "cron_cleanup", { deleted, failures: failures.length, pushSent: push.sent });
  return { maintenance, deleted, failures, push };
});
