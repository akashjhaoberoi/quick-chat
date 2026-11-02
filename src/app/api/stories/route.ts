import { z } from "zod";
import { handler, unwrap } from "@/lib/api/handler";
import { overlaySchema, uuid } from "@/lib/validation";

const postStorySchema = z
  .object({
    mediaId: uuid,
    caption: z.string().trim().max(250).default(""),
    overlays: z.array(overlaySchema).max(40).default([]),
    audience: z.enum(["public", "friends", "custom"]).default("friends"),
    customIds: z.array(uuid).max(500).optional(),
    friendListId: uuid.optional(),
  })
  .refine((v) => v.audience !== "custom" || (v.customIds?.length ?? 0) > 0 || Boolean(v.friendListId), {
    message: "Choose who can see this story",
    path: ["customIds"],
  });

/** GET /api/stories — the story carousel feed (one row per author). */
export const GET = handler({ rateLimit: { name: "stories.feed", limit: 120, window: 60 } }, async ({ supabase }) => {
  return unwrap(await supabase.rpc("stories_feed")) ?? [];
});

/** POST /api/stories — post an uploaded (purpose "story") media asset as a 24h story. */
export const POST = handler(
  { body: postStorySchema, rateLimit: { name: "stories.post", limit: 20, window: 60 } },
  async ({ supabase, body }) => {
    const id = unwrap(
      await supabase.rpc("post_story", {
        p_media_id: body.mediaId,
        p_caption: body.caption,
        p_overlays: body.overlays,
        p_audience: body.audience,
        p_custom_ids: body.audience === "custom" ? (body.customIds ?? null) : null,
        p_friend_list_id: body.audience === "custom" ? (body.friendListId ?? null) : null,
      }),
    ) as string;
    return { id };
  },
);
