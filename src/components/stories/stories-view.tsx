"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Clock, Eye, Film, Globe, Heart, Lock, Plus, Sparkles, Trash2, Users } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { Avatar } from "@/components/ui/avatar";
import { useConfirm } from "@/components/ui/confirm";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { useMe } from "@/components/providers/session-provider";
import { formatCountdown, useNow } from "@/components/snaps/hooks";
import { api } from "@/lib/api/client";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn, displayName, mediaUrl, relativeTime } from "@/lib/utils";
import type { Story } from "@/types/models";
import { usePublicStories, useUserStories } from "./hooks";
import { StoryCarousel } from "./story-carousel";
import { StoryViewersSheet } from "./story-viewers-sheet";

const AUDIENCE_ICON = { friends: Users, public: Globe, custom: Lock } as const;

/** /stories — carousel, my active stories, public stories. Handles ?view={storyId}. */
export function StoriesView() {
  const router = useRouter();
  const params = useSearchParams();
  const viewId = params.get("view");
  const handled = useRef<string | null>(null);

  // Notification deep link: resolve the story's author, then open the viewer.
  useEffect(() => {
    if (!viewId || handled.current === viewId) return;
    handled.current = viewId;
    void getSupabaseBrowserClient()
      .from("stories")
      .select("user_id")
      .eq("id", viewId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.user_id) router.replace(`/stories/view/${data.user_id}?story=${viewId}`);
        else {
          toast.error("This story is no longer available.");
          router.replace("/stories");
        }
      });
  }, [viewId, router]);

  return (
    <PageContainer>
      <PageHeader
        title="Stories"
        subtitle="Moments that disappear after 24 hours"
        actions={
          <Link href="/camera?mode=story" className="brand-gradient inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-white shadow-[var(--shadow-soft)]">
            <Plus className="h-4 w-4" /> Add to story
          </Link>
        }
      />
      <StoryCarousel />
      <div className="space-y-6 px-4 py-4 md:px-6">
        <MyStories />
        <PublicStories />
      </div>
    </PageContainer>
  );
}

function StoryThumb({ story, className }: { story: Pick<Story, "media_id" | "media_kind">; className?: string }) {
  return (
    <span className={cn("relative block overflow-hidden bg-surface-3", className)}>
      {story.media_id && story.media_kind === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={mediaUrl(story.media_id)} alt="" loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <span className="brand-gradient flex h-full w-full items-center justify-center text-white">
          <Film className="h-5 w-5" />
        </span>
      )}
    </span>
  );
}

function MyStories() {
  const me = useMe();
  const stories = useUserStories(me.user.id);
  const now = useNow();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [viewersFor, setViewersFor] = useState<string | null>(null);
  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/api/stories/${id}`),
    onSuccess: () => {
      toast.success("Story deleted");
      void queryClient.invalidateQueries({ queryKey: ["stories"] });
    },
  });

  const askDelete = async (id: string) => {
    if (await confirm({ title: "Delete this story?", description: "It will be removed for everyone right away.", confirmLabel: "Delete", danger: true })) del.mutate(id);
  };

  return (
    <section aria-labelledby="my-story-title" className="rounded-3xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 id="my-story-title" className="font-display text-lg font-bold">
          My story
        </h2>
        {stories.data?.length ? (
          <Link href={`/stories/view/${me.user.id}`} className="text-sm font-semibold text-brand">
            Watch
          </Link>
        ) : null}
      </div>
      {stories.isPending ? (
        <div className="space-y-2">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : stories.isError ? (
        <ErrorState description="Couldn't load your stories." onRetry={() => void stories.refetch()} />
      ) : stories.data.length === 0 ? (
        <EmptyState
          icon={<Sparkles />}
          title="Your story is empty"
          description="Share a photo or video with your friends for 24 hours."
          action={
            <Link href="/camera?mode=story" className="brand-gradient inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-white">
              <Plus className="h-4 w-4" /> Add to story
            </Link>
          }
          className="py-8"
        />
      ) : (
        <ul className="space-y-2">
          {stories.data.map((s) => {
            const Icon = AUDIENCE_ICON[s.audience];
            const left = new Date(s.expires_at).getTime() - now;
            return (
              <li key={s.id} className="flex items-center gap-3 rounded-2xl p-2 hover:bg-surface-2">
                <Link href={`/stories/view/${me.user.id}?story=${s.id}`} aria-label="Open story">
                  <StoryThumb story={s} className="h-16 w-11 rounded-xl" />
                </Link>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{s.caption || (s.media_kind === "video" ? "Video" : "Photo")}</p>
                  <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
                    <span>{relativeTime(s.created_at)}</span>
                    <span className="inline-flex items-center gap-0.5">
                      <Clock className="h-3 w-3" /> {left > 0 ? `${formatCountdown(left)} left` : "Expired"}
                    </span>
                    <span className="inline-flex items-center gap-0.5 capitalize">
                      <Icon className="h-3 w-3" /> {s.audience}
                    </span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setViewersFor(s.id)}
                  className="flex items-center gap-2 rounded-xl px-2 py-1.5 text-xs font-bold text-ink-2 hover:bg-surface-3"
                  aria-label={`${s.view_count ?? 0} views, ${s.reaction_count ?? 0} reactions. Show viewers`}
                >
                  <span className="inline-flex items-center gap-0.5">
                    <Eye className="h-3.5 w-3.5" /> {s.view_count ?? 0}
                  </span>
                  <span className="inline-flex items-center gap-0.5">
                    <Heart className="h-3.5 w-3.5" /> {s.reaction_count ?? 0}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => void askDelete(s.id)}
                  disabled={del.isPending && del.variables === s.id}
                  className="rounded-full p-2 text-muted hover:bg-danger-soft hover:text-danger"
                  aria-label="Delete story"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <StoryViewersSheet storyId={viewersFor} onClose={() => setViewersFor(null)} />
    </section>
  );
}

function PublicStories() {
  const stories = usePublicStories();
  return (
    <section aria-labelledby="public-stories-title">
      <h2 id="public-stories-title" className="mb-3 flex items-center gap-2 font-display text-lg font-bold">
        <Globe className="h-5 w-5 text-brand" /> Public stories
      </h2>
      {stories.isPending ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="aspect-[9/16] rounded-2xl" />
          ))}
        </div>
      ) : stories.isError ? (
        <ErrorState description="Couldn't load public stories." onRetry={() => void stories.refetch()} />
      ) : stories.data.length === 0 ? (
        <EmptyState icon={<Globe />} title="No public stories right now" description="Public stories from creators and people you can see will appear here." className="py-8" />
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {stories.data.map((s) => (
            <li key={s.id}>
              <Link
                href={`/stories/view/${s.user_id}?story=${s.id}`}
                className="group relative block aspect-[9/16] overflow-hidden rounded-2xl bg-surface-3 shadow-[var(--shadow-soft)]"
                aria-label={`Public story by ${displayName(s)}`}
              >
                <StoryThumb story={s} className="absolute inset-0 transition-transform duration-300 group-hover:scale-105" />
                <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30" />
                <span className="absolute left-2 top-2 flex items-center gap-1.5">
                  <Avatar mediaId={s.avatar_media_id} name={displayName(s)} size="xs" ring="unseen" />
                </span>
                <span className="absolute inset-x-2 bottom-2 text-white">
                  <span className="block truncate text-sm font-bold">{displayName(s)}</span>
                  {s.caption ? <span className="block truncate text-xs text-white/80">{s.caption}</span> : null}
                  <span className="block text-[11px] text-white/70">{relativeTime(s.created_at)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
