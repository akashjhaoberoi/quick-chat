import { z } from "zod";
import { handler, unwrap } from "@/lib/api/handler";
import { uuid } from "@/lib/validation";

/** PATCH /api/conversations/{id}/members/{userId} — promote/demote or transfer ownership. */
export const PATCH = handler(
  { body: z.object({ role: z.enum(["owner", "admin", "member"]) }), rateLimit: { name: "groups.members", limit: 30, window: 60 } },
  async ({ supabase, params, body }) => {
    unwrap(
      await supabase.rpc("set_group_role", {
        p_conversation_id: uuid.parse(params.id),
        p_user_id: uuid.parse(params.userId),
        p_role: body.role,
      }),
    );
    return { ok: true };
  },
);

/** DELETE /api/conversations/{id}/members/{userId} — remove a member. */
export const DELETE = handler({ rateLimit: { name: "groups.members", limit: 30, window: 60 } }, async ({ supabase, params }) => {
  unwrap(
    await supabase.rpc("remove_group_member", { p_conversation_id: uuid.parse(params.id), p_user_id: uuid.parse(params.userId) }),
  );
  return { ok: true };
});
