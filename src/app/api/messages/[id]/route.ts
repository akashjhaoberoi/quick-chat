import { z } from "zod";
import { handler, unwrap } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { uuid } from "@/lib/validation";
import type { Message } from "@/types/models";
import { hydrateMessages, MESSAGE_COLUMNS } from "../_lib/hydrate";

/** GET /api/messages/{id} — one message with attachments, reactions and reply preview. */
export const GET = handler({ rateLimit: { name: "messages.read", limit: 240, window: 60 } }, async ({ supabase, user, params }) => {
  const row = unwrap(await supabase.from("messages").select(MESSAGE_COLUMNS).eq("id", uuid.parse(params.id)).maybeSingle()) as unknown as Message | null;
  if (!row) throw new ApiError(404, "message_not_found", "Message not found.");
  const [message] = await hydrateMessages(supabase, user.id, [row]);
  return message;
});

/** PATCH /api/messages/{id} — edit own text within 15 minutes. */
export const PATCH = handler(
  { body: z.object({ body: z.string().trim().min(1).max(4000) }), rateLimit: { name: "messages.edit", limit: 30, window: 60 } },
  async ({ supabase, params, body }) => {
    return unwrap(await supabase.rpc("edit_message", { p_message_id: uuid.parse(params.id), p_body: body.body })) as Message;
  },
);

/** DELETE /api/messages/{id}?scope=me|everyone */
export const DELETE = handler(
  { query: z.object({ scope: z.enum(["me", "everyone"]).default("me") }), rateLimit: { name: "messages.delete", limit: 60, window: 60 } },
  async ({ supabase, params, query }) => {
    unwrap(await supabase.rpc("delete_message", { p_message_id: uuid.parse(params.id), p_for_everyone: query.scope === "everyone" }));
    return { ok: true };
  },
);
