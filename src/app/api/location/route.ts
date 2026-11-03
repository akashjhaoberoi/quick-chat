import { after } from "next/server";
import { z } from "zod";
import { handler, unwrap } from "@/lib/api/handler";
import { dispatchRecentPush } from "@/lib/push";
import { uuid } from "@/lib/validation";
import type { Message } from "@/types/models";
import { hydrateMessages } from "../messages/_lib/hydrate";

const body = z.object({
  conversationId: uuid,
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracy: z.number().min(0).max(100_000).nullable().optional(),
  // 1440 = "Until I stop" (ends automatically after 24 h).
  minutes: z.union([z.literal(15), z.literal(60), z.literal(480), z.literal(1440)]),
});

/** POST /api/location — start a time-boxed live location share; returns the location message. */
export const POST = handler({ body, rateLimit: { name: "location.start", limit: 10, window: 60 } }, async ({ supabase, user, body }) => {
  const row = unwrap(
    await supabase.rpc("start_location_share", {
      p_conversation_id: body.conversationId,
      p_lat: body.lat,
      p_lng: body.lng,
      p_accuracy: body.accuracy ?? null,
      p_minutes: body.minutes,
    }),
  ) as Message;
  after(() => dispatchRecentPush());
  const [message] = await hydrateMessages(supabase, user.id, [row]);
  return message;
});
