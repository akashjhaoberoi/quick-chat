import { handler, unwrap } from "@/lib/api/handler";
import { uuid } from "@/lib/validation";

/** POST /api/conversations/{id}/read — mark everything up to now as read. */
export const POST = handler({ rateLimit: { name: "conversations.read", limit: 120, window: 60 } }, async ({ supabase, params }) => {
  unwrap(await supabase.rpc("mark_conversation_read", { p_conversation_id: uuid.parse(params.id) }));
  return { ok: true };
});
