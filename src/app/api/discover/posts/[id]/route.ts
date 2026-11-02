import { handler, unwrap } from "@/lib/api/handler";
import { ApiError, messageFor } from "@/lib/api/errors";
import { uuid } from "@/lib/validation";
import type { PostDetails } from "@/components/discover/types";
import { hydratePosts, POST_COLUMNS, type PostRow } from "../../_lib/hydrate";

/** A single post with its author and the viewer's like/save/follow state (RLS decides visibility). */
export const GET = handler({}, async ({ supabase, params, user }): Promise<PostDetails> => {
  const id = uuid.parse(params.id);
  const row = unwrap(await supabase.from("posts").select(POST_COLUMNS).eq("id", id).maybeSingle()) as PostRow | null;
  const [post] = row ? await hydratePosts(supabase, user.id, [row]) : [];
  if (!post) throw new ApiError(404, "post_not_found", messageFor("post_not_found"));
  return post;
});

/** Deletes one of your own posts (media is queued for deletion). */
export const DELETE = handler({ rateLimit: { name: "discover.delete", limit: 20, window: 60 } }, async ({ supabase, params }) => {
  const id = uuid.parse(params.id);
  unwrap(await supabase.rpc("delete_post", { p_post_id: id }));
  return { id };
});
