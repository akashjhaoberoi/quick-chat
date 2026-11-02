import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { unwrap } from "@/lib/api/handler";
import type { FeedPost } from "@/types/models";

export type PostRow = {
  id: string;
  author_id: string;
  media_id: string | null;
  media_kind: "image" | "video";
  caption: string;
  hashtags: string[];
  visibility: "public" | "followers";
  status: string;
  like_count: number;
  comment_count: number;
  view_count: number;
  share_count: number;
  created_at: string;
};

type Author = { id: string; username: string; display_name: string; avatar_media_id: string | null; is_verified: boolean };

/**
 * Turns raw post rows (already filtered by RLS) into FeedPost objects with the
 * author and the viewer's like/save/follow state. Posts whose author isn't
 * visible (blocked, deactivated) are dropped.
 */
export async function hydratePosts(
  supabase: SupabaseClient,
  userId: string,
  rows: PostRow[],
): Promise<(FeedPost & { visibility: PostRow["visibility"] })[]> {
  const posts = rows.filter((r) => r.status === "active" && r.media_id);
  if (posts.length === 0) return [];
  const postIds = posts.map((p) => p.id);
  const authorIds = Array.from(new Set(posts.map((p) => p.author_id)));

  const [authorsRes, likesRes, savesRes, followsRes] = await Promise.all([
    supabase.from("profiles").select("id, username, display_name, avatar_media_id, is_verified").in("id", authorIds),
    supabase.from("post_likes").select("post_id").eq("user_id", userId).in("post_id", postIds),
    supabase.from("saved_posts").select("post_id").eq("user_id", userId).in("post_id", postIds),
    supabase.from("follows").select("followee_id").eq("follower_id", userId).in("followee_id", authorIds),
  ]);
  const authors = new Map(((unwrap(authorsRes) ?? []) as Author[]).map((a) => [a.id, a]));
  const liked = new Set(((unwrap(likesRes) ?? []) as { post_id: string }[]).map((r) => r.post_id));
  const saved = new Set(((unwrap(savesRes) ?? []) as { post_id: string }[]).map((r) => r.post_id));
  const following = new Set(((unwrap(followsRes) ?? []) as { followee_id: string }[]).map((r) => r.followee_id));

  const out: (FeedPost & { visibility: PostRow["visibility"] })[] = [];
  for (const p of posts) {
    const a = authors.get(p.author_id);
    if (!a) continue;
    out.push({
      id: p.id,
      author_id: p.author_id,
      username: a.username,
      display_name: a.display_name,
      avatar_media_id: a.avatar_media_id,
      is_verified: a.is_verified,
      media_id: p.media_id as string,
      media_kind: p.media_kind,
      caption: p.caption,
      hashtags: p.hashtags,
      like_count: p.like_count,
      comment_count: p.comment_count,
      view_count: p.view_count,
      share_count: p.share_count,
      created_at: p.created_at,
      liked: liked.has(p.id),
      saved: saved.has(p.id),
      following: following.has(p.author_id),
      score: 0,
      visibility: p.visibility,
    });
  }
  return out;
}

export const POST_COLUMNS =
  "id, author_id, media_id, media_kind, caption, hashtags, visibility, status, like_count, comment_count, view_count, share_count, created_at";
