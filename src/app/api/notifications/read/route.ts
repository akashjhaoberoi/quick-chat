import { z } from "zod";
import { handler, unwrap } from "@/lib/api/handler";
import { uuid } from "@/lib/validation";

/** POST /api/notifications/read {ids?} — mark the given notifications (or all when omitted) as read. */
export const POST = handler(
  {
    body: z.object({ ids: z.array(uuid).min(1).max(200).optional() }),
    rateLimit: { name: "notifications.read", limit: 120, window: 60 },
  },
  async ({ supabase, body }) => {
    const updated = unwrap(await supabase.rpc("mark_notifications_read", { p_ids: body.ids ?? null })) as number;
    return { updated: Number(updated ?? 0) };
  },
);
