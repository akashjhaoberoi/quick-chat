import { handler, unwrap } from "@/lib/api/handler";
import { uuid } from "@/lib/validation";

/** Deletes your own comment, or any comment on your own post. */
export const DELETE = handler({ rateLimit: { name: "discover.comment_delete", limit: 30, window: 60 } }, async ({ supabase, params }) => {
  const id = uuid.parse(params.id);
  unwrap(await supabase.rpc("delete_post_comment", { p_comment_id: id }));
  return { id };
});
