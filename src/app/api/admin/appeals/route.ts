import { z } from "zod";
import { handler, unwrap } from "@/lib/api/handler";
import { offsetParam, page, PAGE_SIZE, PROFILE } from "../_lib/shared";

const query = z.object({
  status: z.enum(["pending", "accepted", "rejected", "all"]).catch("pending").default("pending"),
  offset: offsetParam,
});

/** GET /api/admin/appeals?status=&offset= — appeals with the original moderation action (pending: oldest first). */
export const GET = handler({ auth: { admin: "moderator" }, query }, async ({ supabase, query }) => {
  let q = supabase
    .from("appeals")
    .select(
      `*, user:profiles!appeals_user_id_fkey(${PROFILE}),
       reviewer:profiles!appeals_reviewed_by_fkey(${PROFILE}),
       action:moderation_actions!appeals_moderation_action_id_fkey(*, moderator:profiles!moderation_actions_moderator_id_fkey(${PROFILE}))`,
      { count: "exact" },
    );
  if (query.status !== "all") q = q.eq("status", query.status);
  q = q.order("created_at", { ascending: query.status === "pending" });
  const { data, error, count } = await q.range(query.offset, query.offset + PAGE_SIZE - 1);
  return page(unwrap({ data, error }) ?? [], query.offset, PAGE_SIZE, count ?? null);
});
