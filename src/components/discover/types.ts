import type { FeedPost, PostComment, UserCard } from "@/types/models";

export type FeedMode = "for_you" | "following" | "trending";
export type DiscoverTab = FeedMode | "saved";

export const DISCOVER_PAGE_SIZE = 10;

/** GET /api/discover/posts/{id} */
export type PostDetails = FeedPost & { visibility: "public" | "followers" };

export type CommentAuthor = UserCard & { is_verified: boolean };

export type CommentNode = PostComment & {
  author: CommentAuthor | null;
  replies: (PostComment & { author: CommentAuthor | null })[];
};

/** GET /api/discover/posts/{id}/comments */
export type CommentsResponse = { comments: CommentNode[]; total: number };

export type TrendingTag = { tag: string; post_count: number };

export type Creator = {
  id: string;
  username: string;
  display_name: string;
  avatar_media_id: string | null;
  is_verified: boolean;
  follower_count: number;
  following: boolean;
};

export const HASHTAG_RE = /#([A-Za-z0-9_]{1,40})/g;

export function normalizeTag(raw: string): string {
  return raw.replace(/^#/, "").trim().toLowerCase();
}

export const TAG_PATTERN = /^[a-z0-9_]{1,40}$/;
