import { z } from "zod";
import { handler, unwrap } from "@/lib/api/handler";
import { uuid } from "@/lib/validation";

/** POST /api/conversations/{id}/mute — { until: ISO date | null }. */
export const POST = handler(
  {
    body: z.object({ until: z.string().datetime({ offset: true }).nullable() }),
    rateLimit: { name: "conversations.mute", limit: 30, window: 60 },
  },
  async ({ supabase, params, body }) => {
    unwrap(await supabase.rpc("set_conversation_muted", { p_conversation_id: uuid.parse(params.id), p_until: body.until }));
    return { ok: true };
  },
);
