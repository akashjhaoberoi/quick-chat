import { z } from "zod";
import { handler, unwrap } from "@/lib/api/handler";
import { uuid } from "@/lib/validation";

/** POST /api/conversations/{id}/disappearing — { mode: "off" | "24h" | "7d" }. */
export const POST = handler(
  { body: z.object({ mode: z.enum(["off", "24h", "7d"]) }), rateLimit: { name: "conversations.disappearing", limit: 10, window: 60 } },
  async ({ supabase, params, body }) => {
    unwrap(await supabase.rpc("set_disappearing_mode", { p_conversation_id: uuid.parse(params.id), p_mode: body.mode }));
    return { ok: true };
  },
);
