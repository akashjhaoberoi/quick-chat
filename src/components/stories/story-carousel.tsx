"use client";

import Link from "next/link";
import { Plus } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/feedback";
import { useMe } from "@/components/providers/session-provider";
import { displayName } from "@/lib/utils";
import { useStoriesFeed } from "./hooks";

/**
 * Horizontal story carousel: "Your story" first, then authors from
 * rpc stories_feed (gradient ring = unseen, grey = seen).
 */
export function StoryCarousel() {
  const me = useMe();
  const feed = useStoriesFeed();
  const mine = feed.data?.find((f) => f.is_me);
  const others = (feed.data ?? []).filter((f) => !f.is_me);
  const myName = displayName(me.profile);

  return (
    <nav aria-label="Stories" className="w-full">
      <ul className="flex gap-3 overflow-x-auto px-4 py-2 no-scrollbar snap-x">
        <li className="snap-start">
          <div className="relative flex w-[72px] flex-col items-center gap-1.5">
            {mine ? (
              <Link href={`/stories/view/${me.user.id}`} aria-label="View your story" className="rounded-full">
                <Avatar mediaId={me.profile.avatar_media_id} name={myName} size="lg" ring="seen" />
              </Link>
            ) : (
              <Link href="/camera?mode=story" aria-label="Add to your story" className="rounded-full">
                <Avatar mediaId={me.profile.avatar_media_id} name={myName} size="lg" ring={null} className="p-[4.5px]" />
              </Link>
            )}
            <Link
              href="/camera?mode=story"
              aria-label="Add to your story"
              className="brand-gradient absolute right-0.5 top-[46px] flex h-6 w-6 items-center justify-center rounded-full text-white ring-2 ring-bg"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={3} />
            </Link>
            <span className="w-full truncate text-center text-xs font-semibold">Your story</span>
          </div>
        </li>
        {feed.isPending
          ? Array.from({ length: 5 }).map((_, i) => (
              <li key={i} className="flex w-[72px] flex-col items-center gap-1.5" aria-hidden>
                <Skeleton className="h-[65px] w-[65px] rounded-full" />
                <Skeleton className="h-3 w-12" />
              </li>
            ))
          : others.map((f) => (
              <li key={f.user_id} className="snap-start">
                <Link
                  href={`/stories/view/${f.user_id}`}
                  className="flex w-[72px] flex-col items-center gap-1.5 rounded-2xl"
                  aria-label={`${displayName(f)}'s story${f.has_unseen ? ", new" : ""}`}
                >
                  <Avatar mediaId={f.avatar_media_id} name={displayName(f)} size="lg" ring={f.has_unseen ? "unseen" : "seen"} />
                  <span className={`w-full truncate text-center text-xs ${f.has_unseen ? "font-bold" : "font-medium text-muted"}`}>{displayName(f)}</span>
                </Link>
              </li>
            ))}
        {feed.isError ? (
          <li className="flex items-center">
            <button type="button" onClick={() => void feed.refetch()} className="text-xs font-semibold text-muted underline">
              Couldn&apos;t load stories — retry
            </button>
          </li>
        ) : !feed.isPending && others.length === 0 ? (
          <li className="flex items-center text-xs text-muted">Stories from friends and people you follow appear here.</li>
        ) : null}
      </ul>
    </nav>
  );
}
