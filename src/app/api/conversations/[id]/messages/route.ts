import { z } from "zod";
import { handler, unwrap } from "@/lib/api/handler";
import { uuid } from "@/lib/validation";
import type { Message } from "@/types/models";
import type { MessagePage } from "@/components/chat/types";
import { hydrateMessages, MESSAGE_COLUMNS } from "../../../messages/_lib/hydrate";

const query = z.object({
  before: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(40),
  pinned: z.enum(["1", "true"]).optional(),
});

/**
 * GET /api/conversations/{id}/messages?before=&limit= — page of messages older
 * than `before` (newest page first), returned in ascending order.
 * `pinned=1` returns the conversation's pinned messages instead.
 */
export const GET = handler(
  { query, rateLimit: { name: "messages.read", limit: 240, window: 60 } },
  async ({ supabase, user, params, query }) => {
    const id = uuid.parse(params.id);
    let q = supabase.from("messages").select(MESSAGE_COLUMNS).eq("conversation_id", id);
    if (query.pinned) {
      q = q.not("pinned_at", "is", null).is("deleted_at", null).order("pinned_at", { ascending: false }).limit(20);
    } else {
      if (query.before) q = q.lt("created_at", query.before);
      q = q.order("created_at", { ascending: false }).limit(query.limit + 1);
    }
    const rows = unwrap(await q) as unknown as Message[];
    const hasMore = !query.pinned && rows.length > query.limit;
    const page = (hasMore ? rows.slice(0, query.limit) : rows).reverse();
    const result: MessagePage = { messages: await hydrateMessages(supabase, user.id, page), hasMore };
    return result;
  },
);
