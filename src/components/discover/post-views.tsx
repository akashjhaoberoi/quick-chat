"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Compass, Hash } from "lucide-react";
import { PageHeader } from "@/components/shell/page-header";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { api, ClientApiError, errorMessage } from "@/lib/api/client";
import { qk } from "@/lib/query-keys";
import { CommentsPanel, CommentsSheet } from "./comments";
import { Feed } from "./feed";
import { PostCard } from "./post-card";
import { normalizeTag, TAG_PATTERN, type PostDetails } from "./types";

/** /discover/[id]: one post with its comments. */
export function PostView() {
  const { id } = useParams<{ id: string }>();
  const [muted, setMuted] = useState(true);
  const [sheet, setSheet] = useState(false);
  const query = useQuery({ queryKey: qk.post(id), queryFn: () => api.get<PostDetails>(`/api/discover/posts/${id}`) });

  if (query.isPending) {
    return (
      <div className="flex h-dvh items-center justify-center p-4">
        <Skeleton className="aspect-[9/16] h-[80dvh] rounded-3xl" />
      </div>
    );
  }
  if (query.isError) {
    const gone = query.error instanceof ClientApiError && query.error.status === 404;
    return gone ? (
      <EmptyState
        icon={<Compass />}
        title="Post unavailable"
        description="This post was deleted or you don't have access to it."
        action={
          <Link href="/discover" className="text-sm font-semibold text-brand hover:underline">
            Back to Discover
          </Link>
        }
      />
    ) : (
      <ErrorState description={errorMessage(query.error)} onRetry={() => void query.refetch()} />
    );
  }
  const post = query.data;
  return (
    <div className="flex h-[calc(100dvh-7.5rem-env(safe-area-inset-bottom))] flex-col md:h-dvh">
      <PageHeader title="Post" subtitle={`@${post.username}`} back="/discover" className="pb-2" />
      <div className="flex min-h-0 flex-1 gap-6 px-0 pb-4 lg:px-6">
        <div className="min-h-0 flex-1">
          <PostCard post={post} active mountMedia muted={muted} onToggleMute={() => setMuted((m) => !m)} onOpenComments={() => setSheet(true)} />
        </div>
        <aside className="hidden w-96 shrink-0 flex-col rounded-3xl border border-border bg-surface p-4 lg:flex">
          <h2 className="mb-2 font-display text-base font-bold">Comments ({post.comment_count})</h2>
          <CommentsPanel post={post} />
        </aside>
      </div>
      <CommentsSheet post={sheet ? post : null} open={sheet} onClose={() => setSheet(false)} />
    </div>
  );
}

/** /discover/tag/[tag]: feed filtered by a hashtag. */
export function TagView() {
  const params = useParams<{ tag: string }>();
  const tag = normalizeTag(decodeURIComponent(params.tag ?? ""));
  if (!TAG_PATTERN.test(tag)) {
    return <EmptyState icon={<Hash />} title="Invalid hashtag" description="Hashtags use letters, numbers and underscores." />;
  }
  return (
    <div className="flex h-[calc(100dvh-7.5rem-env(safe-area-inset-bottom))] flex-col md:h-dvh">
      <PageHeader title={`#${tag}`} subtitle="Top posts with this hashtag" back="/discover" className="pb-2" />
      <div className="min-h-0 flex-1">
        <Feed
          tab="trending"
          tag={tag}
          empty={<EmptyState icon={<Hash />} title={`No posts with #${tag}`} description="Use this hashtag in a caption to start the trend." />}
        />
      </div>
    </div>
  );
}
