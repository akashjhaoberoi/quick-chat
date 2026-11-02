import { z } from "zod";
import { handler, unwrap } from "@/lib/api/handler";
import { uuid } from "@/lib/validation";

/** POST /api/conversations/{id}/archive — { archived: boolean }. */
export const POST = handler(
  { body: z.object({ archived: z.boolean() }), rateLimit: { name: "conversations.archive", limit: 30, window: 60 } },
  async ({ supabase, params, body }) => {
    unwrap(await supabase.rpc("set_conversation_archived", { p_conversation_id: uuid.parse(params.id), p_archived: body.archived }));
    return { ok: true };
  },
);
