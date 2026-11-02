"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { ErrorState, Skeleton } from "@/components/ui/feedback";
import { api, errorMessage } from "@/lib/api/client";
import { qk } from "@/lib/query-keys";
import type { FeedPost } from "@/types/models";
import { CommentsSheet } from "./comments";
import { PostCard } from "./post-card";
import type { DiscoverTab } from "./types";

type Page = { items: FeedPost[]; nextOffset: number | null };

/** Vertical, scroll-snapping Discover feed with infinite loading. */
export function Feed({ tab, tag, empty }: { tab: DiscoverTab; tag?: string; empty: ReactNode }) {
  const query = useInfiniteQuery({
    queryKey: qk.discover(tab, tag),
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      tab === "saved"
        ? api.get<Page>("/api/discover/saved", { offset: pageParam })
        : api.get<Page>("/api/discover", { mode: tab, offset: pageParam, tag }),
    getNextPageParam: (last) => last.nextOffset ?? undefined,
  });
  const posts = useMemo(() => {
    const seen = new Set<string>();
    return (query.data?.pages.flatMap((p) => p.items) ?? []).filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
  }, [query.data]);

  const [activeIndex, setActiveIndex] = useState(0);
  const [muted, setMuted] = useState(true);
  const [commentsFor, setCommentsFor] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && e.intersectionRatio >= 0.6) setActiveIndex(Number((e.target as HTMLElement).dataset.index));
        }
      },
      { root, threshold: [0.6] },
    );
    root.querySelectorAll("[data-index]").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [posts.length]);

  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && activeIndex >= posts.length - 3) void fetchNextPage();
  }, [activeIndex, posts.length, hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (query.isPending) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <Skeleton className="aspect-[9/16] h-full max-h-[80dvh] rounded-3xl" />
      </div>
    );
  }
  if (query.isError) return <ErrorState description={errorMessage(query.error)} onRetry={() => void query.refetch()} />;
  if (posts.length === 0) return <>{empty}</>;

  const commentPost = posts.find((p) => p.id === commentsFor) ?? null;

  return (
    <>
      <div ref={containerRef} className="h-full snap-y snap-mandatory overflow-y-auto overscroll-contain no-scrollbar" aria-label="Discover feed">
        {posts.map((post, i) => (
          <div key={post.id} data-index={i} className="h-full snap-start snap-always lg:py-4">
            <PostCard
              post={post}
              active={i === activeIndex}
              mountMedia={Math.abs(i - activeIndex) <= 1}
              muted={muted}
              onToggleMute={() => setMuted((m) => !m)}
              onOpenComments={() => setCommentsFor(post.id)}
            />
          </div>
        ))}
        {isFetchingNextPage ? (
          <div className="flex justify-center py-6">
            <Loader2 className="h-6 w-6 animate-spin text-brand" aria-label="Loading more" />
          </div>
        ) : null}
      </div>
      <CommentsSheet post={commentPost} open={Boolean(commentPost)} onClose={() => setCommentsFor(null)} />
    </>
  );
}
