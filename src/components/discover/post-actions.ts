"use client";

import { useMutation, useQueryClient, type InfiniteData, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { qk } from "@/lib/query-keys";
import type { FeedPost } from "@/types/models";

type FeedPage = { items: FeedPost[]; nextOffset: number | null };

/** Applies a patch to a post in every cached feed page and the single-post cache. */
export function patchPosts(qc: QueryClient, match: (p: FeedPost) => boolean, patch: (p: FeedPost) => Partial<FeedPost> | null) {
  qc.setQueriesData<InfiniteData<FeedPage>>({ queryKey: ["discover"] }, (data) =>
    data?.pages
      ? {
          ...data,
          pages: data.pages.map((pg) => ({
            ...pg,
            items: pg.items.flatMap((p) => {
              if (!match(p)) return [p];
              const next = patch(p);
              return next === null ? [] : [{ ...p, ...next }];
            }),
          })),
        }
      : data,
  );
  qc.setQueriesData<FeedPost>({ queryKey: ["post"] }, (p) => {
    if (!p || !("id" in p) || !match(p)) return p;
    const next = patch(p);
    return next === null ? p : { ...p, ...next };
  });
}

const viewed = new Set<string>();

export function usePostActions(post: FeedPost) {
  const qc = useQueryClient();
  const byId = (p: FeedPost) => p.id === post.id;

  const like = useMutation({
    mutationFn: () => api.post<{ liked: boolean }>(`/api/discover/posts/${post.id}/like`),
    onMutate: () => {
      const was = post.liked;
      patchPosts(qc, byId, (p) => ({ liked: !was, like_count: Math.max(0, p.like_count + (was ? -1 : 1)) }));
      return { was };
    },
    onError: (_e, _v, ctx) => {
      if (ctx) patchPosts(qc, byId, (p) => ({ liked: ctx.was, like_count: Math.max(0, p.like_count + (ctx.was ? 1 : -1)) }));
    },
    onSuccess: (res, _v, ctx) => {
      if (ctx && res.liked === ctx.was) patchPosts(qc, byId, () => ({ liked: res.liked }));
    },
  });

  const save = useMutation({
    mutationFn: () => api.post<{ saved: boolean }>(`/api/discover/posts/${post.id}/save`),
    onMutate: () => {
      patchPosts(qc, byId, () => ({ saved: !post.saved }));
      return { was: post.saved };
    },
    onError: (_e, _v, ctx) => ctx && patchPosts(qc, byId, () => ({ saved: ctx.was })),
    onSuccess: (res) => {
      patchPosts(qc, byId, () => ({ saved: res.saved }));
      toast.success(res.saved ? "Saved to your collection" : "Removed from saved");
      void qc.invalidateQueries({ queryKey: qk.discover("saved") });
    },
  });

  const follow = useMutation({
    mutationFn: () => api.post<{ following: boolean }>(`/api/users/${post.author_id}/follow`),
    onSuccess: (res) => {
      patchPosts(qc, (p) => p.author_id === post.author_id, () => ({ following: res.following }));
      toast.success(res.following ? `Following @${post.username}` : `Unfollowed @${post.username}`);
    },
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/api/discover/posts/${post.id}`),
    onSuccess: () => {
      patchPosts(qc, byId, () => null);
      qc.removeQueries({ queryKey: qk.post(post.id) });
      toast.success("Post deleted");
    },
  });

  const share = async () => {
    const url = `${window.location.origin}/discover/${post.id}`;
    let shared = false;
    try {
      if (navigator.share) {
        await navigator.share({ title: `@${post.username} on Quick Chat`, text: post.caption.slice(0, 120), url });
        shared = true;
      }
    } catch (error) {
      if ((error as { name?: string })?.name === "AbortError") return;
    }
    if (!shared) {
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied");
        shared = true;
      } catch {
        toast.error("Couldn't copy the link");
      }
    }
    if (shared) {
      patchPosts(qc, byId, (p) => ({ share_count: p.share_count + 1 }));
      void api.post(`/api/discover/posts/${post.id}/share`).catch(() => undefined);
    }
  };

  const recordView = () => {
    if (viewed.has(post.id)) return;
    viewed.add(post.id);
    void api.post(`/api/discover/posts/${post.id}/view`).catch(() => viewed.delete(post.id));
  };

  return { like, save, follow, remove, share, recordView };
}
