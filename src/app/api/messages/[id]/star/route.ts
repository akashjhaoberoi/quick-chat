import { z } from "zod";
import { handler, unwrap } from "@/lib/api/handler";
import { uuid } from "@/lib/validation";

/** POST /api/messages/{id}/star — { starred: boolean }. */
export const POST = handler(
  { body: z.object({ starred: z.boolean() }), rateLimit: { name: "messages.star", limit: 60, window: 60 } },
  async ({ supabase, params, body }) => {
    unwrap(await supabase.rpc("set_message_starred", { p_message_id: uuid.parse(params.id), p_starred: body.starred }));
    return { ok: true };
  },
);
