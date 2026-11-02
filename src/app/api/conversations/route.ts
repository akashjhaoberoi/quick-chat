import { after } from "next/server";
import { z } from "zod";
import { handler, unwrap } from "@/lib/api/handler";
import { dispatchRecentPush } from "@/lib/push";
import { uuid } from "@/lib/validation";
import type { ConversationSummary } from "@/types/models";

const createBody = z.discriminatedUnion("type", [
  z.object({ type: z.literal("direct"), userId: uuid }),
  z.object({
    type: z.literal("group"),
    name: z.string().trim().min(1).max(60),
    memberIds: z.array(uuid).min(1).max(99),
    description: z.string().max(300).optional(),
    avatarMediaId: uuid.optional(),
  }),
]);

const listQuery = z.object({
  archived: z.enum(["true", "false", "1", "0"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z.string().datetime({ offset: true }).optional(),
});

/** GET /api/conversations — the caller's conversation list. */
export const GET = handler({ query: listQuery }, async ({ supabase, query }) => {
  const archived = query.archived === "true" || query.archived === "1";
  return unwrap(
    await supabase.rpc("my_conversations", { p_archived: archived, p_limit: query.limit, p_before: query.before ?? null }),
  ) as ConversationSummary[];
});

/** POST /api/conversations — open a direct chat or create a group. */
export const POST = handler(
  { body: createBody, rateLimit: { name: "conversations.create", limit: 20, window: 60 } },
  async ({ supabase, body }) => {
    if (body.type === "direct") {
      const id = unwrap(await supabase.rpc("get_or_create_direct_conversation", { p_other: body.userId })) as string;
      return { id };
    }
    const id = unwrap(
      await supabase.rpc("create_group", { p_name: body.name, p_member_ids: body.memberIds, p_description: body.description ?? "" }),
    ) as string;
    if (body.avatarMediaId) {
      unwrap(await supabase.rpc("update_group", { p_conversation_id: id, p_avatar_media_id: body.avatarMediaId }));
    }
    after(() => dispatchRecentPush());
    return { id };
  },
);
