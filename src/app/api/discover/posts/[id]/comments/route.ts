import { after } from "next/server";
import { z } from "zod";
import { handler, unwrap } from "@/lib/api/handler";
import { ApiError, messageFor } from "@/lib/api/errors";
import { dispatchRecentPush } from "@/lib/push";
import { uuid } from "@/lib/validation";
import type { PostComment } from "@/types/models";
import type { CommentAuthor, CommentNode, CommentsResponse } from "@/components/discover/types";

const AUTHOR_COLUMNS = "id, username, display_name, avatar_media_id, is_verified";

/** Comments on a post, threaded one level deep (replies grouped under their top-level comment). */
export const GET = handler({}, async ({ supabase, params }): Promise<CommentsResponse> => {
  const id = uuid.parse(params.id);
  const post = unwrap(await supabase.from("posts").select("id, status").eq("id", id).maybeSingle()) as { id: string; status: string } | null;
  if (!post || post.status !== "active") throw new ApiError(404, "post_not_found", messageFor("post_not_found"));

  const rows = (unwrap(
    await supabase
      .from("post_comments")
      .select("id, post_id, user_id, parent_id, body, status, created_at")
      .eq("post_id", id)
      .eq("status", "active")
      .order("created_at", { ascending: true })
      .limit(500),
  ) ?? []) as PostComment[];

  const userIds = Array.from(new Set(rows.map((r) => r.user_id).filter((x): x is string => Boolean(x))));
  const authors = userIds.length
    ? ((unwrap(await supabase.from("profiles").select(AUTHOR_COLUMNS).in("id", userIds)) ?? []) as CommentAuthor[])
    : [];
  const byId = new Map(authors.map((a) => [a.id, a]));

  const roots = new Map<string, CommentNode>();
  const orphans: CommentNode[] = [];
  for (const r of rows) {
    if (!r.parent_id) roots.set(r.id, { ...r, author: r.user_id ? (byId.get(r.user_id) ?? null) : null, replies: [] });
  }
  for (const r of rows) {
    if (!r.parent_id) continue;
    const node = { ...r, author: r.user_id ? (byId.get(r.user_id) ?? null) : null };
    const parent = roots.get(r.parent_id);
    // A reply whose parent was deleted is promoted to the top level.
    if (parent) parent.replies.push(node);
    else orphans.push({ ...node, replies: [] });
  }
  // Newest conversations first; replies stay chronological.
  const comments = [...roots.values(), ...orphans].sort((a, b) => b.created_at.localeCompare(a.created_at));
  return { comments, total: rows.length };
});

/** Adds a comment or a reply (parentId). The database rate-limits and notifies the author. */
export const POST = handler(
  {
    body: z.object({
      body: z.string().trim().min(1, "Write something first").max(500),
      parentId: uuid.optional(),
    }),
    rateLimit: { name: "discover.comment", limit: 15, window: 60 },
  },
  async ({ supabase, params, body, user }) => {
    const id = uuid.parse(params.id);
    const row = unwrap(
      await supabase.rpc("add_post_comment", { p_post_id: id, p_body: body.body, p_parent_id: body.parentId ?? null }),
    ) as PostComment;
    const { data: author } = await supabase.from("profiles").select(AUTHOR_COLUMNS).eq("id", user.id).maybeSingle();
    after(() => dispatchRecentPush());
    return { ...row, author: (author as CommentAuthor | null) ?? null };
  },
);
