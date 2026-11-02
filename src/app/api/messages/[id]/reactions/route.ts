import { z } from "zod";
import { handler, unwrap } from "@/lib/api/handler";
import { uuid } from "@/lib/validation";

/** POST /api/messages/{id}/reactions — { emoji | null }; same emoji again toggles it off. */
export const POST = handler(
  { body: z.object({ emoji: z.string().min(1).max(16).nullable() }), rateLimit: { name: "messages.react", limit: 60, window: 60 } },
  async ({ supabase, params, body }) => {
    const emoji = unwrap(await supabase.rpc("react_to_message", { p_message_id: uuid.parse(params.id), p_emoji: body.emoji })) as string | null;
    return { emoji };
  },
);
