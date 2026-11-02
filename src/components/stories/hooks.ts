"use client";

import { useQuery } from "@tanstack/react-query";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { qk } from "@/lib/query-keys";
import type { Story, StoryFeedItem, UserCard } from "@/types/models";

export type StoryViewer = {
  viewer_id: string;
  username: string;
  display_name: string;
  avatar_media_id: string | null;
  viewed_at: string;
  emoji: string | null;
};

export type PublicStory = {
  id: string;
  user_id: string;
  username: string;
  display_name: string;
  avatar_media_id: string | null;
  caption: string;
  media_kind: "image" | "video";
  created_at: string;
  media_id: string | null;
};

export const storyKeys = {
  publicStories: ["stories", "public"] as const,
  viewers: (storyId: string) => ["stories", "viewers", storyId] as const,
  author: (userId: string) => ["stories", "author", userId] as const,
};

/** Image stories show for 6 s; videos for their duration (max 60 s). */
export const IMAGE_STORY_MS = 6000;
export const MAX_VIDEO_MS = 60_000;

export const STORY_REACTIONS = ["😂", "😍", "🔥", "😮", "😢", "👏"] as const;

function supabase() {
  return getSupabaseBrowserClient();
}

/** Carousel feed: one row per author, unseen first (rpc stories_feed). */
export function useStoriesFeed() {
  return useQuery({
    queryKey: qk.storiesFeed,
    queryFn: async () => {
      const { data, error } = await supabase().rpc("stories_feed");
      if (error) throw error;
      return (data ?? []) as StoryFeedItem[];
    },
    staleTime: 30_000,
  });
}

export function useUserStories(userId: string | undefined) {
  return useQuery({
    queryKey: qk.userStories(userId ?? ""),
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase().rpc("user_stories", { p_user_id: userId });
      if (error) throw error;
      return (data ?? []) as Story[];
    },
    staleTime: 15_000,
  });
}

/** Public profile card for a story author (used when they aren't in my feed). */
export function useStoryAuthor(userId: string | undefined) {
  return useQuery({
    queryKey: storyKeys.author(userId ?? ""),
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error } = await supabase()
        .from("profiles")
        .select("id, username, display_name, avatar_media_id")
        .eq("id", userId!)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as UserCard | null;
    },
    staleTime: 5 * 60_000,
  });
}

export function useStoryViewers(storyId: string | null) {
  return useQuery({
    queryKey: storyKeys.viewers(storyId ?? ""),
    enabled: Boolean(storyId),
    queryFn: async () => {
      const { data, error } = await supabase().rpc("story_viewers", { p_story_id: storyId });
      if (error) throw error;
      return (data ?? []) as StoryViewer[];
    },
    staleTime: 10_000,
  });
}

/** Public stories (rpc search_public_stories) plus media ids for thumbnails. */
export function usePublicStories() {
  return useQuery({
    queryKey: storyKeys.publicStories,
    queryFn: async () => {
      const client = supabase();
      const { data, error } = await client.rpc("search_public_stories", { p_query: "", p_limit: 30 });
      if (error) throw error;
      const rows = (data ?? []) as Omit<PublicStory, "media_id">[];
      if (rows.length === 0) return [] as PublicStory[];
      const { data: media } = await client.from("stories").select("id, media_id").in("id", rows.map((r) => r.id));
      const byId = new Map(((media ?? []) as { id: string; media_id: string | null }[]).map((m) => [m.id, m.media_id]));
      return rows.map((r) => ({ ...r, media_id: byId.get(r.id) ?? null }));
    },
    staleTime: 60_000,
  });
}
