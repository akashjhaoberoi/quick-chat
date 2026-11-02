import { z } from "zod";
import { handler, unwrap } from "@/lib/api/handler";
import { uuid } from "@/lib/validation";

/** Publishes an uploaded image/video (purpose "post") to Discover. */
export const POST = handler(
  {
    body: z.object({
      mediaId: uuid,
      caption: z.string().max(500).default(""),
      visibility: z.enum(["public", "followers"]).default("public"),
    }),
    rateLimit: { name: "discover.post", limit: 10, window: 300 },
  },
  async ({ supabase, body }) => {
    const id = unwrap(
      await supabase.rpc("create_post", { p_media_id: body.mediaId, p_caption: body.caption.trim(), p_visibility: body.visibility }),
    ) as string;
    return { id };
  },
);
