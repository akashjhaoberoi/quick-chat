import { handler, unwrap } from "@/lib/api/handler";
import { profileUpdateSchema } from "@/lib/validation";

/**
 * PATCH /api/profiles/me {displayName?, bio?, avatarMediaId?, coverMediaId?, isPrivate?} → profile
 * Passing null for avatarMediaId / coverMediaId removes the picture.
 */
export const PATCH = handler(
  { body: profileUpdateSchema, rateLimit: { name: "profiles.update", limit: 30, window: 60 } },
  async ({ supabase, body }) => {
    return unwrap(
      await supabase.rpc("update_profile", {
        p_display_name: body.displayName ?? null,
        p_bio: body.bio ?? null,
        p_avatar_media_id: body.avatarMediaId ?? null,
        p_cover_media_id: body.coverMediaId ?? null,
        p_is_private: body.isPrivate ?? null,
        p_clear_avatar: body.avatarMediaId === null,
        p_clear_cover: body.coverMediaId === null,
      }),
    );
  },
);
