import { handler, unwrap } from "@/lib/api/handler";
import { uuid } from "@/lib/validation";

/** Counts a share (native share sheet or copied link). */
export const POST = handler({ rateLimit: { name: "discover.share", limit: 30, window: 60 } }, async ({ supabase, params }) => {
  const id = uuid.parse(params.id);
  unwrap(await supabase.rpc("record_post_share", { p_post_id: id }));
  return null;
});
