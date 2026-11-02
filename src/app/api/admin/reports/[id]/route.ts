import { handler, unwrap } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { uuid } from "@/lib/validation";
import { PROFILE } from "../../_lib/shared";

type ContentState = { status: "active" | "removed" | "deleted" | "expired" | "unknown"; label: string };

/**
 * GET /api/admin/reports/{id} — one report with its server-side snapshot,
 * the people involved, moderation actions taken, and other reports on the same
 * target. Moderators only ever see the snapshot, never the surrounding
 * conversation (messages are not readable by moderators under RLS).
 */
export const GET = handler({ auth: { admin: "moderator" } }, async ({ supabase, params }) => {
  const id = uuid.parse(params.id);
  const report = unwrap(
    await supabase
      .from("reports")
      .select(
        `*, reporter:profiles!reports_reporter_id_fkey(${PROFILE}),
         target_user:profiles!reports_target_user_id_fkey(${PROFILE}),
         assignee:profiles!reports_assigned_to_fkey(${PROFILE}),
         resolver:profiles!reports_resolved_by_fkey(${PROFILE})`,
      )
      .eq("id", id)
      .maybeSingle(),
  ) as { target_type: string; target_id: string; target_user_id: string | null } | null;
  if (!report) throw new ApiError(404, "report_not_found", "Report not found.");

  const [actions, related, contentActions, ownerActions] = await Promise.all([
    supabase
      .from("moderation_actions")
      .select(`*, moderator:profiles!moderation_actions_moderator_id_fkey(${PROFILE})`)
      .eq("report_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("reports")
      .select(`id, reason, status, details, created_at, reporter:profiles!reports_reporter_id_fkey(${PROFILE})`)
      .eq("target_type", report.target_type)
      .eq("target_id", report.target_id)
      .neq("id", id)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("moderation_actions")
      .select("action, created_at")
      .eq("target_type", report.target_type)
      .eq("target_id", report.target_id)
      .in("action", ["remove_content", "restore_content"])
      .order("created_at", { ascending: false })
      .limit(1),
    report.target_user_id
      ? supabase.from("moderation_actions").select("action").eq("target_user_id", report.target_user_id).limit(1000)
      : Promise.resolve({ data: [] as { action: string }[], error: null }),
  ]);

  let contentState: ContentState | null = null;
  const lastContentAction = (unwrap(contentActions) ?? [])[0] as { action: string } | undefined;
  if (report.target_type === "post") {
    const { data } = await supabase.from("posts").select("status").eq("id", report.target_id).maybeSingle();
    contentState = !data
      ? { status: "deleted", label: "Deleted by the author" }
      : data.status === "active"
        ? { status: "active", label: "Visible" }
        : data.status === "removed"
          ? { status: "removed", label: "Removed by moderation" }
          : { status: "deleted", label: "Deleted by the author" };
  } else if (report.target_type === "story") {
    const { data } = await supabase.from("stories").select("removed_at, deleted_at, expires_at").eq("id", report.target_id).maybeSingle();
    contentState = !data || data.deleted_at
      ? { status: "deleted", label: "Deleted by the author" }
      : data.removed_at
        ? { status: "removed", label: "Removed by moderation" }
        : new Date(data.expires_at).getTime() < Date.now()
          ? { status: "expired", label: "Expired (no longer visible)" }
          : { status: "active", label: "Visible" };
  } else if (report.target_type === "comment") {
    const { data } = await supabase.from("post_comments").select("status").eq("id", report.target_id).maybeSingle();
    contentState = !data || data.status === "deleted"
      ? { status: "deleted", label: "Deleted by the author" }
      : data.status === "removed"
        ? { status: "removed", label: "Removed by moderation" }
        : { status: "active", label: "Visible" };
  } else if (report.target_type === "message" || report.target_type === "group") {
    contentState =
      lastContentAction?.action === "remove_content"
        ? { status: "removed", label: "Removed by moderation" }
        : { status: "unknown", label: "Not removed by moderation" };
  }

  const ownerHistory = { warn: 0, suspend: 0, ban: 0, remove_content: 0 };
  for (const a of (unwrap(ownerActions) ?? []) as { action: string }[]) {
    if (a.action in ownerHistory) ownerHistory[a.action as keyof typeof ownerHistory]++;
  }

  return {
    report,
    actions: unwrap(actions) ?? [],
    related: unwrap(related) ?? [],
    contentState,
    ownerHistory,
  };
});
