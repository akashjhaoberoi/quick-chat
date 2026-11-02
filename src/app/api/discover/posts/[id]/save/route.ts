import { handler, unwrap } from "@/lib/api/handler";
import { uuid } from "@/lib/validation";

/** Toggles a post in the viewer's saved collection; returns the new state. */
export const POST = handler({ rateLimit: { name: "discover.save", limit: 60, window: 60 } }, async ({ supabase, params }) => {
  const id = uuid.parse(params.id);
  const saved = unwrap(await supabase.rpc("toggle_saved_post", { p_post_id: id })) as boolean;
  return { saved };
});
