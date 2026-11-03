import { after } from "next/server";
import { handler, unwrap } from "@/lib/api/handler";
import { dispatchRecentPush } from "@/lib/push";
import { sendMessageSchema, uuid } from "@/lib/validation";
import type { Message } from "@/types/models";
import { hydrateMessages } from "./_lib/hydrate";

const body = sendMessageSchema.extend({ conversationId: uuid });

/**
 * POST /api/messages — send a message. Idempotent per `clientId`, so retries
 * after a network failure never create duplicates.
 */
export const POST = handler(
  { body, rateLimit: { name: "messages.send", limit: 30, window: 10 }, maxBodyBytes: 32 * 1024 },
  async ({ supabase, user, body }) => {
    const row = unwrap(
      await supabase.rpc("send_message", {
        p_conversation_id: body.conversationId,
        p_type: body.type,
        p_body: body.body ?? null,
        p_metadata: body.metadata ?? {},
        p_reply_to: body.replyTo ?? null,
        p_client_id: body.clientId ?? null,
        p_media_ids: body.mediaIds?.length ? body.mediaIds : null,
        // Only sent when set, so plain messages also work before the media-protection migration.
        ...(body.mediaMode && body.mediaMode !== "normal" ? { p_media_mode: body.mediaMode } : {}),
      }),
    ) as Message;
    after(() => dispatchRecentPush());
    const [message] = await hydrateMessages(supabase, user.id, [row]);
    return message;
  },
);
