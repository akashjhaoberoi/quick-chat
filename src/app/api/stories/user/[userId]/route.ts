import { handler, unwrap } from "@/lib/api/handler";
import { uuid } from "@/lib/validation";

/** GET /api/stories/user/:userId — that user's active stories visible to me (oldest first). */
export const GET = handler({ rateLimit: { name: "stories.user", limit: 120, window: 60 } }, async ({ supabase, params }) => {
  const userId = uuid.parse(params.userId);
  return unwrap(await supabase.rpc("user_stories", { p_user_id: userId })) ?? [];
});
