import { z } from "zod";
import { handler, unwrap } from "@/lib/api/handler";
import { offsetParam, page, PAGE_SIZE, PROFILE } from "../_lib/shared";

const query = z.object({
  status: z.enum(["open", "pending", "reviewing", "actioned", "dismissed", "all"]).catch("open").default("open"),
  type: z.enum(["user", "message", "story", "post", "comment", "group"]).optional().catch(undefined),
  reason: z
    .enum(["spam", "harassment", "hate", "nudity", "violence", "self_harm", "scam", "impersonation", "underage", "other"])
    .optional()
    .catch(undefined),
  offset: offsetParam,
});

/**
 * GET /api/admin/reports?status=&type=&reason=&offset= — the moderation queue.
 * Open reports are sorted oldest first so nothing waits forever.
 */
export const GET = handler({ auth: { admin: "moderator" }, query }, async ({ supabase, query }) => {
  let q = supabase
    .from("reports")
    .select(
      `id, reporter_id, target_type, target_id, target_user_id, reason, details, snapshot, status, assigned_to,
       resolved_by, resolved_at, resolution_note, created_at,
       reporter:profiles!reports_reporter_id_fkey(${PROFILE}),
       target_user:profiles!reports_target_user_id_fkey(${PROFILE})`,
      { count: "exact" },
    );
  if (query.status === "open") q = q.in("status", ["pending", "reviewing"]);
  else if (query.status !== "all") q = q.eq("status", query.status);
  if (query.type) q = q.eq("target_type", query.type);
  if (query.reason) q = q.eq("reason", query.reason);
  const oldestFirst = query.status === "open" || query.status === "pending" || query.status === "reviewing";
  const { data, error, count } = await q
    .order("created_at", { ascending: oldestFirst })
    .range(query.offset, query.offset + PAGE_SIZE - 1);
  const rows = unwrap({ data, error }) ?? [];
  return page(rows, query.offset, PAGE_SIZE, count ?? null);
});
