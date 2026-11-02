import { after } from "next/server";
import { z } from "zod";
import { handler, unwrap } from "@/lib/api/handler";
import { dispatchRecentPush } from "@/lib/push";
import { uuid } from "@/lib/validation";

/** POST /api/messages/{id}/forward — { conversationIds: up to 5 }. */
export const POST = handler(
  { body: z.object({ conversationIds: z.array(uuid).min(1).max(5) }), rateLimit: { name: "messages.forward", limit: 10, window: 60 } },
  async ({ supabase, params, body }) => {
    const count = unwrap(
      await supabase.rpc("forward_message", { p_message_id: uuid.parse(params.id), p_conversation_ids: Array.from(new Set(body.conversationIds)) }),
    ) as number;
    after(() => dispatchRecentPush());
    return { count };
  },
);
