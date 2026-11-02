import { handler, unwrap } from "@/lib/api/handler";

/** GET /api/admin/jobs — the 50 most recent background job runs. */
export const GET = handler({ auth: { admin: "moderator" } }, async ({ supabase }) => {
  return (
    unwrap(
      await supabase
        .from("job_runs")
        .select("id, job, status, details, started_at, finished_at")
        .order("started_at", { ascending: false })
        .limit(50),
    ) ?? []
  );
});
