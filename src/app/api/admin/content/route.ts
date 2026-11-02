import { z } from "zod";
import { handler, unwrap } from "@/lib/api/handler";
import { uuid } from "@/lib/validation";
import { offsetParam, page, PAGE_SIZE, PROFILE, reasonSchema } from "../_lib/shared";

const query = z.object({
  kind: z.enum(["posts", "stories"]).catch("posts").default("posts"),
  state: z.enum(["active", "removed", "all"]).catch("all").default("all"),
  offset: offsetParam,
});

/** GET /api/admin/content?kind=posts|stories&state=&offset= — recent public posts / stories. */
export const GET = handler({ auth: { admin: "moderator" }, query }, async ({ supabase, query }) => {
  const from = query.offset;
  const to = query.offset + PAGE_SIZE - 1;
  if (query.kind === "posts") {
    let q = supabase
      .from("posts")
      .select(
        `id, media_id, media_kind, caption, visibility, status, like_count, comment_count, view_count, created_at,
         author:profiles!posts_author_id_fkey(${PROFILE})`,
        { count: "exact" },
      )
      .eq("visibility", "public");
    q = query.state === "all" ? q.in("status", ["active", "removed"]) : q.eq("status", query.state);
    const { data, error, count } = await q.order("created_at", { ascending: false }).range(from, to);
    return page(unwrap({ data, error }) ?? [], query.offset, PAGE_SIZE, count ?? null);
  }
  let q = supabase
    .from("stories")
    .select(
      `id, media_id, media_kind, caption, audience, view_count, created_at, expires_at, removed_at,
       author:profiles!stories_user_id_fkey(${PROFILE})`,
      { count: "exact" },
    )
    .eq("audience", "public")
    .is("deleted_at", null);
  if (query.state === "active") q = q.is("removed_at", null);
  if (query.state === "removed") q = q.not("removed_at", "is", null);
  const { data, error, count } = await q.order("created_at", { ascending: false }).range(from, to);
  return page(unwrap({ data, error }) ?? [], query.offset, PAGE_SIZE, count ?? null);
});

const body = z.object({
  targetType: z.enum(["story", "post", "comment", "message", "group"]),
  targetId: uuid,
  reason: reasonSchema,
  reportId: uuid.optional(),
  restore: z.boolean().optional().default(false),
});

/** POST /api/admin/content — remove (or restore) a story, post, comment, reported message or group (rpc admin_remove_content). */
export const POST = handler(
  { auth: { admin: "moderator" }, body, rateLimit: { name: "admin.content", limit: 120, window: 60 } },
  async ({ supabase, body }) => {
    const actionId = unwrap(
      await supabase.rpc("admin_remove_content", {
        p_target_type: body.targetType,
        p_target_id: body.targetId,
        p_reason: body.reason,
        p_report_id: body.reportId ?? null,
        p_restore: body.restore,
      }),
    ) as string;
    return { actionId };
  },
);
