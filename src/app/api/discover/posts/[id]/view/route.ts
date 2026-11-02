import { handler, unwrap } from "@/lib/api/handler";
import { uuid } from "@/lib/validation";

/** Records a unique view (counted once per viewer). */
export const POST = handler({ rateLimit: { name: "discover.view", limit: 240, window: 60 } }, async ({ supabase, params }) => {
  const id = uuid.parse(params.id);
  unwrap(await supabase.rpc("record_post_view", { p_post_id: id }));
  return null;
});
