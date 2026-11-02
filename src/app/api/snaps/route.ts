import { after } from "next/server";
import { z } from "zod";
import { handler, unwrap } from "@/lib/api/handler";
import { dispatchRecentPush } from "@/lib/push";
import { overlaySchema, uuid } from "@/lib/validation";
import { fetchInbox, fetchSent } from "@/components/snaps/data";

const sendSnapSchema = z.object({
  mediaId: uuid,
  recipientIds: z.array(uuid).min(1).max(50),
  durationSeconds: z.number().int().min(1).max(30).default(10),
  viewOnce: z.boolean().default(true),
  allowReplay: z.boolean().default(false),
  caption: z.string().trim().max(250).default(""),
  overlays: z.array(overlaySchema).max(40).default([]),
  expireHours: z.union([z.literal(1), z.literal(6), z.literal(24), z.literal(72), z.literal(168)]).default(24),
});

/** GET /api/snaps?box=inbox|sent — snaps received or sent (RLS-filtered). */
export const GET = handler(
  { query: z.object({ box: z.enum(["inbox", "sent"]).default("inbox") }), rateLimit: { name: "snaps.list", limit: 120, window: 60 } },
  async ({ supabase, user, query }) => {
    return query.box === "sent" ? fetchSent(supabase, user.id) : fetchInbox(supabase, user.id);
  },
);

/** POST /api/snaps — send an uploaded (purpose "snap") media asset to friends. */
export const POST = handler(
  { body: sendSnapSchema, rateLimit: { name: "snaps.send", limit: 30, window: 60 } },
  async ({ supabase, body }) => {
    const id = unwrap(
      await supabase.rpc("send_snap", {
        p_media_id: body.mediaId,
        p_recipient_ids: Array.from(new Set(body.recipientIds)),
        p_duration_seconds: body.durationSeconds,
        p_view_once: body.viewOnce,
        p_allow_replay: body.viewOnce ? false : body.allowReplay,
        p_caption: body.caption,
        p_overlays: body.overlays,
        p_expire_hours: body.expireHours,
      }),
    ) as string;
    after(() => dispatchRecentPush());
    return { id };
  },
);
