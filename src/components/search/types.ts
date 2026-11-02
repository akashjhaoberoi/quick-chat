import type { UserSearchResult } from "@/components/friends/types";

/** Response shapes of GET /api/search (shared by server and client). */

export const SEARCH_TYPES = ["all", "users", "groups", "messages", "creators", "stories", "posts", "hashtags"] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];
export type SearchCategory = Exclude<SearchType, "all">;

export type GroupHit = { conversation_id: string; name: string; avatar_media_id: string | null; member_count: number };

export type MessageHit = {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  sender_name: string | null;
  type: string;
  body: string | null;
  created_at: string;
  conversation_title: string;
  conversation_type: "direct" | "group" | null;
  conversation_avatar_media_id: string | null;
};

export type CreatorHit = {
  id: string;
  username: string;
  display_name: string;
  avatar_media_id: string | null;
  is_verified: boolean;
  follower_count: number;
  following: boolean;
};

export type StoryHit = {
  id: string;
  user_id: string;
  username: string;
  display_name: string;
  avatar_media_id: string | null;
  caption: string;
  media_kind: "image" | "video";
  created_at: string;
};

export type PostHit = {
  id: string;
  author_id: string;
  username: string;
  media_id: string;
  media_kind: "image" | "video";
  caption: string;
  like_count: number;
  view_count: number;
  created_at: string;
};

export type HashtagHit = { tag: string; post_count: number; capped: boolean };

export type SearchHitMap = {
  users: UserSearchResult;
  groups: GroupHit;
  messages: MessageHit;
  creators: CreatorHit;
  stories: StoryHit;
  posts: PostHit;
  hashtags: HashtagHit;
};

export type SearchAllResult = { [K in SearchCategory]: SearchHitMap[K][] };

export type SearchPage<K extends SearchCategory = SearchCategory> = { items: SearchHitMap[K][]; nextOffset: number | null };

/** type=all → SearchAllResult; any other type → SearchPage. */
export type SearchResponse = { type: "all"; results: SearchAllResult } | { type: SearchCategory; page: SearchPage };
