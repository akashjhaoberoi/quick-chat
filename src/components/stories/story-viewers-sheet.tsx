"use client";

import Link from "next/link";
import { Eye } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/ui/feedback";
import { displayName, relativeTime } from "@/lib/utils";
import { useStoryViewers } from "./hooks";

/** Owner-only list of who viewed a story and how they reacted (rpc story_viewers). */
export function StoryViewersSheet({ storyId, onClose }: { storyId: string | null; onClose: () => void }) {
  const viewers = useStoryViewers(storyId);
  return (
    <Dialog open={storyId !== null} onClose={onClose} variant="sheet" title="Viewers" description={viewers.data ? `${viewers.data.length} ${viewers.data.length === 1 ? "person" : "people"} viewed this story` : undefined}>
      {viewers.isPending ? (
        <ListSkeleton rows={3} />
      ) : viewers.isError ? (
        <ErrorState description="Couldn't load viewers." onRetry={() => void viewers.refetch()} />
      ) : viewers.data.length === 0 ? (
        <EmptyState icon={<Eye />} title="No views yet" description="You'll see who viewed your story here." />
      ) : (
        <ul className="space-y-1">
          {viewers.data.map((v) => (
            <li key={v.viewer_id}>
              <Link href={`/profile/${v.username}`} className="flex items-center gap-3 rounded-2xl p-2 hover:bg-surface-2">
                <Avatar mediaId={v.avatar_media_id} name={displayName(v)} size="md" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{displayName(v)}</span>
                  <span className="block text-xs text-muted">Viewed {relativeTime(v.viewed_at)}</span>
                </span>
                {v.emoji ? (
                  <span className="text-2xl" aria-label={`Reacted ${v.emoji}`}>
                    {v.emoji}
                  </span>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
