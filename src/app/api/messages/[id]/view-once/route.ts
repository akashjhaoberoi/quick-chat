import { handler, unwrap } from "@/lib/api/handler";
import { uuid } from "@/lib/validation";

/**
 * POST /api/messages/:id/view-once — opens view-once media. The server starts
 * one view window (photos 60 s, videos their length + 30 s); /api/media/:id
 * only serves the media inside it. Re-opening later fails with already_viewed.
 */
export const POST = handler({ rateLimit: { name: "messages.viewOnce", limit: 30, window: 60 } }, async ({ supabase, params }) => {
  const viewExpiresAt = unwrap(await supabase.rpc("open_message_media", { p_message_id: uuid.parse(params.id) })) as string;
  return { viewExpiresAt };
});

/** DELETE /api/messages/:id/view-once — ends my view window early (viewer closed). */
export const DELETE = handler({ rateLimit: { name: "messages.viewOnce", limit: 30, window: 60 } }, async ({ supabase, params }) => {
  unwrap(await supabase.rpc("close_message_media", { p_message_id: uuid.parse(params.id) }));
  return { closed: true };
});
