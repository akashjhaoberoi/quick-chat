import { z } from "zod";
import { handler, unwrap } from "@/lib/api/handler";
import { uuid } from "@/lib/validation";
import type { SearchHit } from "@/components/chat/types";

/** GET /api/messages/search?q=&conversationId=&offset= — full-text search over readable messages. */
export const GET = handler(
  {
    query: z.object({
      q: z.string().trim().min(1).max(100),
      conversationId: uuid.optional(),
      offset: z.coerce.number().int().min(0).max(1000).default(0),
    }),
    rateLimit: { name: "messages.search", limit: 60, window: 60 },
  },
  async ({ supabase, query }) => {
    return unwrap(
      await supabase.rpc("search_messages", {
        p_query: query.q,
        p_conversation_id: query.conversationId ?? null,
        p_limit: 30,
        p_offset: query.offset,
      }),
    ) as SearchHit[];
  },
);
