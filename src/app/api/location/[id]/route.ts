import { z } from "zod";
import { handler, unwrap } from "@/lib/api/handler";
import { uuid } from "@/lib/validation";

/** PATCH /api/location/{id} — update the live position (throttled server-side too). */
export const PATCH = handler(
  {
    body: z.object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      accuracy: z.number().min(0).max(100_000).nullable().optional(),
    }),
    rateLimit: { name: "location.update", limit: 20, window: 60 },
  },
  async ({ supabase, params, body }) => {
    unwrap(
      await supabase.rpc("update_location_share", {
        p_share_id: uuid.parse(params.id),
        p_lat: body.lat,
        p_lng: body.lng,
        p_accuracy: body.accuracy ?? null,
      }),
    );
    return { ok: true };
  },
);

/** DELETE /api/location/{id} — stop sharing. */
export const DELETE = handler({ rateLimit: { name: "location.stop", limit: 30, window: 60 } }, async ({ supabase, params }) => {
  unwrap(await supabase.rpc("stop_location_share", { p_share_id: uuid.parse(params.id) }));
  return { ok: true };
});
