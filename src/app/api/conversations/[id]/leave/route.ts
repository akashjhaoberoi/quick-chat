import { handler, unwrap } from "@/lib/api/handler";
import { uuid } from "@/lib/validation";

/** POST /api/conversations/{id}/leave — leave a group. */
export const POST = handler({ rateLimit: { name: "groups.leave", limit: 20, window: 60 } }, async ({ supabase, params }) => {
  unwrap(await supabase.rpc("leave_group", { p_conversation_id: uuid.parse(params.id) }));
  return { ok: true };
});
