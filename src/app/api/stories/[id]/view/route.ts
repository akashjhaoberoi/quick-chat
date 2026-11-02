import { handler, unwrap } from "@/lib/api/handler";
import { uuid } from "@/lib/validation";

/** POST /api/stories/:id/view — record that I viewed a story (idempotent; owner views are ignored). */
export const POST = handler({ rateLimit: { name: "stories.view", limit: 300, window: 60 } }, async ({ supabase, params }) => {
  const id = uuid.parse(params.id);
  unwrap(await supabase.rpc("record_story_view", { p_story_id: id }));
  return { viewed: true };
});
