import { handler, unwrap } from "@/lib/api/handler";
import { reportSchema } from "@/lib/validation";

/** POST /api/reports — report a user, message, story, post, comment or group. */
export const POST = handler(
  { body: reportSchema, rateLimit: { name: "reports.create", limit: 20, window: 3600 } },
  async ({ supabase, body }) => {
    const id = unwrap(
      await supabase.rpc("create_report", {
        p_target_type: body.targetType,
        p_target_id: body.targetId,
        p_reason: body.reason,
        p_details: body.details ?? "",
      }),
    ) as string | null;
    // null = an open report from this user already exists (idempotent).
    return { id, duplicate: id === null };
  },
);

/** GET /api/reports — the current user's own reports and their status. */
export const GET = handler({}, async ({ supabase, user }) => {
  return unwrap(
    await supabase
      .from("reports")
      .select("id, target_type, target_id, reason, status, created_at, resolved_at")
      .eq("reporter_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50),
  );
});
