import { z } from "zod";
import { handler, unwrap } from "@/lib/api/handler";
import { uuid } from "@/lib/validation";

/** POST /api/messages/{id}/pin — { pinned: boolean }. */
export const POST = handler(
  { body: z.object({ pinned: z.boolean() }), rateLimit: { name: "messages.pin", limit: 30, window: 60 } },
  async ({ supabase, params, body }) => {
    unwrap(await supabase.rpc("set_message_pinned", { p_message_id: uuid.parse(params.id), p_pinned: body.pinned }));
    return { ok: true };
  },
);
