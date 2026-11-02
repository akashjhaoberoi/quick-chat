import { z } from "zod";
import { handler, unwrap } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { uuid } from "@/lib/validation";
import type { OpenedSnap } from "@/components/snaps/data";
import type { Overlay } from "@/types/models";

type OpenRow = {
  snap_id: string;
  media_id: string;
  media_kind: "image" | "video";
  duration_seconds: number | null;
  overlays: Overlay[] | null;
  caption: string;
  view_expires_at: string;
  sender_id: string;
  replayed: boolean;
};

/**
 * POST /api/snaps/:id/open { replay? } — opens (or replays) a snap. The server
 * opens a short view window; /api/media/:mediaId only serves the media inside it.
 */
export const POST = handler(
  { body: z.object({ replay: z.boolean().optional() }), rateLimit: { name: "snaps.open", limit: 60, window: 60 } },
  async ({ supabase, params, body }) => {
    const snapId = uuid.parse(params.id);
    const rows = unwrap(await supabase.rpc("open_snap", { p_snap_id: snapId, p_replay: body.replay ?? false })) as OpenRow[] | null;
    const row = rows?.[0];
    if (!row) throw new ApiError(404, "snap_not_found", "This Snap is no longer available.");
    const result: OpenedSnap = {
      snapId: row.snap_id,
      mediaId: row.media_id,
      mediaKind: row.media_kind,
      durationSeconds: row.duration_seconds,
      overlays: Array.isArray(row.overlays) ? row.overlays : [],
      caption: row.caption ?? "",
      viewExpiresAt: row.view_expires_at,
      senderId: row.sender_id,
      replayed: row.replayed,
    };
    return result;
  },
);
