import { handler, unwrap } from "@/lib/api/handler";
import { uuid } from "@/lib/validation";

/** GET /api/stories/:id/viewers — viewers and their reactions (owner only; others get []). */
export const GET = handler({ rateLimit: { name: "stories.viewers", limit: 120, window: 60 } }, async ({ supabase, params }) => {
  const id = uuid.parse(params.id);
  return unwrap(await supabase.rpc("story_viewers", { p_story_id: id })) ?? [];
});
