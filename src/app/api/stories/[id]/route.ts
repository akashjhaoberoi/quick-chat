import { handler, unwrap } from "@/lib/api/handler";
import { uuid } from "@/lib/validation";

/** DELETE /api/stories/:id — delete my story (its media is queued for deletion). */
export const DELETE = handler({ rateLimit: { name: "stories.delete", limit: 30, window: 60 } }, async ({ supabase, params }) => {
  const id = uuid.parse(params.id);
  unwrap(await supabase.rpc("delete_story", { p_story_id: id }));
  return { deleted: true };
});
