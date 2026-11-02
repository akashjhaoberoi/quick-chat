"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Eye, Flag, Loader2, MoreHorizontal, Pause, Send, Trash2, Volume2, VolumeX, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Menu } from "@/components/ui/controls";
import { useConfirm } from "@/components/ui/confirm";
import { ReportDialog } from "@/components/moderation/report-dialog";
import { FitFrame } from "@/components/camera/fit-frame";
import { OverlayLayer } from "@/components/camera/overlay-layer";
import { useMe } from "@/components/providers/session-provider";
import { api } from "@/lib/api/client";
import { qk } from "@/lib/query-keys";
import { cn, displayName, mediaUrl, relativeTime } from "@/lib/utils";
import type { Story, UserCard } from "@/types/models";
import { IMAGE_STORY_MS, MAX_VIDEO_MS, STORY_REACTIONS, useStoriesFeed, useStoryAuthor, useUserStories } from "./hooks";
import { StoryViewersSheet } from "./story-viewers-sheet";

/** /stories/view/[userId] — full-screen story player (optional ?story= start). */
export function StoryViewer() {
  const { userId } = useParams<{ userId: string }>();
  const params = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const startStory = params.get("story");
  const feed = useStoriesFeed();
  const stories = useUserStories(userId);
  const feedAuthor = feed.data?.find((f) => f.user_id === userId);
  const fallbackAuthor = useStoryAuthor(feedAuthor ? undefined : userId);
  const author: UserCard | null = feedAuthor
    ? { id: feedAuthor.user_id, username: feedAuthor.username, display_name: feedAuthor.display_name, avatar_media_id: feedAuthor.avatar_media_id }
    : (fallbackAuthor.data ?? null);

  const exit = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: qk.storiesFeed });
    if (window.history.length > 1) router.back();
    else router.replace("/stories");
  }, [queryClient, router]);

  const gotoAuthor = useCallback(
    (dir: 1 | -1) => {
      const list = feed.data ?? [];
      const i = list.findIndex((f) => f.user_id === userId);
      const next = i >= 0 ? list[i + dir] : undefined;
      void queryClient.invalidateQueries({ queryKey: qk.storiesFeed });
      if (next) router.replace(`/stories/view/${next.user_id}`);
      else if (dir === 1) exit();
      return Boolean(next);
    },
    [feed.data, userId, router, exit, queryClient],
  );

  // Escape works even while loading / on errors.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !stories.data?.length && exit();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [exit, stories.data?.length]);

  let body;
  if (stories.isPending) {
    body = (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-white/70" aria-label="Loading stories" />
      </div>
    );
  } else if (stories.isError || !stories.data.length) {
    body = (
      <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-white" role="alert">
        <p className="font-display text-lg font-bold">{stories.isError ? "Couldn't load stories" : "No active stories"}</p>
        <p className="text-sm text-white/60">{stories.isError ? "Check your connection and try again." : "These stories have expired or aren't available to you."}</p>
        <div className="flex gap-2">
          {stories.isError ? (
            <button type="button" onClick={() => void stories.refetch()} className="rounded-xl bg-white/15 px-4 py-2 text-sm font-semibold hover:bg-white/25">
              Retry
            </button>
          ) : null}
          <button type="button" onClick={exit} className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black">
            Close
          </button>
        </div>
      </div>
    );
  } else {
    const list = stories.data;
    const fromParam = startStory ? list.findIndex((s) => s.id === startStory) : -1;
    const firstUnseen = list.findIndex((s) => !s.viewed);
    const initial = fromParam >= 0 ? fromParam : firstUnseen >= 0 ? firstUnseen : 0;
    body = (
      <StoryPlayer
        key={userId}
        authorId={userId}
        author={author}
        stories={list}
        initialIndex={initial}
        onExit={exit}
        onNextAuthor={() => gotoAuthor(1)}
        onPrevAuthor={() => gotoAuthor(-1)}
      />
    );
  }

  return (
    <div className="fixed inset-0 z-[80] bg-black" role="dialog" aria-modal="true" aria-label={`${author ? displayName(author) : "Story"} — stories`}>
      <div className="relative mx-auto h-full w-full md:max-w-[calc(100dvh*9/16)]">{body}</div>
    </div>
  );
}

function StoryPlayer({
  authorId,
  author,
  stories,
  initialIndex,
  onExit,
  onNextAuthor,
  onPrevAuthor,
}: {
  authorId: string;
  author: UserCard | null;
  stories: Story[];
  initialIndex: number;
  onExit: () => void;
  onNextAuthor: () => boolean;
  onPrevAuthor: () => boolean;
}) {
  const me = useMe();
  const router = useRouter();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const isOwner = me.user.id === authorId;
  const [index, setIndex] = useState(initialIndex);
  const [restart, setRestart] = useState(0);
  const [holding, setHolding] = useState(false);
  const [userPaused, setUserPaused] = useState(false);
  const [typing, setTyping] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [viewersFor, setViewersFor] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [reply, setReply] = useState("");
  const [reactions, setReactions] = useState<Record<string, string | null>>({});
  const [hidden, setHidden] = useState(false);
  const viewed = useRef(new Set<string>());
  const holdTimer = useRef<number | undefined>(undefined);
  const heldRef = useRef(false);

  const mutedFallback = useCallback(() => setMuted(true), []);
  const safeIndex = Math.min(index, stories.length - 1);
  const story = stories[safeIndex];
  const next = stories[safeIndex + 1];
  const paused = holding || userPaused || typing || reportOpen || viewersFor !== null || hidden;
  const myReaction = story.id in reactions ? reactions[story.id] : story.my_reaction;

  useEffect(() => {
    const onVis = () => setHidden(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // Record the view once per story (owners are ignored server-side too).
  useEffect(() => {
    if (isOwner || story.viewed || viewed.current.has(story.id)) return;
    viewed.current.add(story.id);
    api.post(`/api/stories/${story.id}/view`).catch(() => viewed.current.delete(story.id));
  }, [story.id, story.viewed, isOwner]);

  const goNext = useCallback(() => {
    if (safeIndex < stories.length - 1) setIndex(safeIndex + 1);
    else onNextAuthor();
  }, [safeIndex, stories.length, onNextAuthor]);

  const goPrev = useCallback(() => {
    if (safeIndex > 0) setIndex(safeIndex - 1);
    else if (!onPrevAuthor()) setRestart((r) => r + 1);
  }, [safeIndex, onPrevAuthor]);

  // Keyboard controls.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      if (reportOpen || viewersFor) return;
      if (e.key === "ArrowRight") goNext();
      else if (e.key === "ArrowLeft") goPrev();
      else if (e.key === " ") {
        e.preventDefault();
        setUserPaused((p) => !p);
      } else if (e.key === "Escape") onExit();
      else return;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goNext, goPrev, onExit, reportOpen, viewersFor]);

  const react = useMutation({
    mutationFn: (emoji: string | null) => api.post(`/api/stories/${story.id}/react`, { emoji }),
    onMutate: (emoji) => {
      const prev = myReaction;
      setReactions((r) => ({ ...r, [story.id]: emoji }));
      return { prev, id: story.id };
    },
    onError: (_e, _v, ctx) => ctx && setReactions((r) => ({ ...r, [ctx.id]: ctx.prev })),
    onSuccess: (_d, emoji) => {
      if (emoji) toast.success(`Reacted ${emoji}`);
      void queryClient.invalidateQueries({ queryKey: qk.userStories(authorId) });
    },
  });

  const sendReply = useMutation({
    mutationFn: (body: string) => api.post<{ conversationId: string }>(`/api/stories/${story.id}/reply`, { body }),
    onSuccess: (r) => {
      setReply("");
      setTyping(false);
      toast.success("Reply sent", { action: { label: "Open chat", onClick: () => router.push(`/chats/${r.conversationId}`) } });
    },
  });

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`/api/stories/${id}`),
    onSuccess: () => {
      toast.success("Story deleted");
      void queryClient.invalidateQueries({ queryKey: ["stories"] });
      if (stories.length <= 1) onExit();
    },
  });

  const askDelete = async () => {
    setUserPaused(true);
    const ok = await confirm({ title: "Delete this story?", description: "It will be removed for everyone right away.", confirmLabel: "Delete", danger: true });
    setUserPaused(false);
    if (ok) del.mutate(story.id);
  };

  // Tap left/right; press and hold to pause.
  const onDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    heldRef.current = false;
    window.clearTimeout(holdTimer.current);
    holdTimer.current = window.setTimeout(() => {
      heldRef.current = true;
      setHolding(true);
    }, 220);
  };
  const onUp = (e: ReactPointerEvent<HTMLElement>) => {
    window.clearTimeout(holdTimer.current);
    if (heldRef.current) {
      heldRef.current = false;
      setHolding(false);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    if (e.clientX - rect.left < rect.width / 3) goPrev();
    else goNext();
  };

  return (
    <div className="relative h-full w-full select-none overflow-hidden text-white" onContextMenu={(e) => e.preventDefault()}>
      <StorySlide
        key={`${story.id}-${restart}`}
        story={story}
        paused={paused}
        muted={muted}
        onMutedFallback={mutedFallback}
        onEnd={goNext}
        index={safeIndex}
        count={stories.length}
      />

      {/* Tap / hold surface */}
      <div
        className="absolute inset-x-0 bottom-36 top-20 z-10 touch-none"
        onPointerDown={onDown}
        onPointerUp={onUp}
        onPointerCancel={() => {
          window.clearTimeout(holdTimer.current);
          setHolding(false);
        }}
        aria-hidden
      />
      <span className="sr-only" aria-live="polite">
        Story {safeIndex + 1} of {stories.length}. Use left and right arrows to navigate, space to pause.
      </span>

      {/* Preload only the next image. */}
      {next?.media_id && next.media_kind === "image" ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={mediaUrl(next.media_id)} alt="" className="hidden" aria-hidden />
      ) : null}

      {/* Header */}
      <div className="absolute inset-x-0 top-0 z-20 px-3 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <div className="mt-3 flex items-center gap-2.5">
          {author ? (
            <Link href={`/profile/${author.username}`} className="flex min-w-0 items-center gap-2.5">
              <Avatar mediaId={author.avatar_media_id} name={displayName(author)} size="sm" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-bold drop-shadow">{isOwner ? "Your story" : displayName(author)}</span>
                <span className="block text-xs text-white/75">{relativeTime(story.created_at)}</span>
              </span>
            </Link>
          ) : (
            <span className="text-sm font-bold">{relativeTime(story.created_at)}</span>
          )}
          <div className="ml-auto flex items-center gap-1">
            {paused && !typing ? <Pause className="h-4 w-4 text-white/80" aria-label="Paused" /> : null}
            <button
              type="button"
              onClick={() => setUserPaused((p) => !p)}
              className="sr-only focus:not-sr-only focus:rounded-full focus:bg-black/40 focus:p-2"
            >
              {userPaused ? "Resume" : "Pause"}
            </button>
            {story.media_kind === "video" ? (
              <button type="button" onClick={() => setMuted((m) => !m)} className="rounded-full p-2 hover:bg-white/10" aria-label={muted ? "Unmute" : "Mute"}>
                {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
              </button>
            ) : null}
            {!isOwner ? (
              <Menu
                label="Story options"
                trigger={
                  <span className="rounded-full p-2 hover:bg-white/10">
                    <MoreHorizontal className="h-5 w-5" />
                  </span>
                }
                items={[{ label: "Report story", icon: <Flag />, onSelect: () => setReportOpen(true), danger: true }]}
              />
            ) : null}
            <button type="button" onClick={onExit} className="rounded-full p-2 hover:bg-white/10" aria-label="Close stories">
              <X className="h-6 w-6" />
            </button>
          </div>
        </div>
      </div>

      {/* Bottom */}
      <div className="absolute inset-x-0 bottom-0 z-20 space-y-3 bg-gradient-to-t from-black/75 via-black/40 to-transparent px-3 pb-[max(1rem,env(safe-area-inset-bottom))] pt-12">
        {story.caption ? <p className="mx-auto max-w-md text-center text-sm font-semibold drop-shadow">{story.caption}</p> : null}
        {isOwner ? (
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setViewersFor(story.id)}
              className="flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-sm font-semibold backdrop-blur hover:bg-white/25"
            >
              <Eye className="h-4 w-4" /> {story.view_count ?? 0} {story.view_count === 1 ? "view" : "views"}
              {story.reaction_count ? <span className="text-white/75">· {story.reaction_count} reactions</span> : null}
            </button>
            <button
              type="button"
              onClick={() => void askDelete()}
              disabled={del.isPending}
              className="rounded-full bg-white/15 p-2.5 backdrop-blur hover:bg-red-500/70"
              aria-label="Delete story"
            >
              <Trash2 className="h-5 w-5" />
            </button>
          </div>
        ) : (
          <>
            <div className="flex justify-center gap-1.5" role="group" aria-label="React to story">
              {STORY_REACTIONS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => react.mutate(myReaction === emoji ? null : emoji)}
                  aria-pressed={myReaction === emoji}
                  aria-label={myReaction === emoji ? `Remove ${emoji} reaction` : `React ${emoji}`}
                  className={cn("rounded-full p-1.5 text-2xl transition-transform hover:scale-125", myReaction === emoji && "scale-110 bg-white/25")}
                >
                  {emoji}
                </button>
              ))}
            </div>
            <form
              className="flex items-center gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (reply.trim()) sendReply.mutate(reply.trim());
              }}
            >
              <input
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onFocus={() => setTyping(true)}
                onBlur={() => setTyping(false)}
                onKeyDown={(e) => e.key === "Escape" && (e.currentTarget as HTMLInputElement).blur()}
                maxLength={1000}
                placeholder={author ? `Reply to ${displayName(author)}…` : "Send a reply…"}
                className="h-11 min-w-0 flex-1 rounded-full border border-white/30 bg-black/30 px-4 text-sm text-white placeholder:text-white/60 backdrop-blur focus:border-white focus:outline-none"
                aria-label="Reply privately"
              />
              <button
                type="submit"
                disabled={!reply.trim() || sendReply.isPending}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-black disabled:opacity-40"
                aria-label="Send reply"
              >
                {sendReply.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </form>
          </>
        )}
      </div>

      {!isOwner ? <ReportDialog open={reportOpen} onClose={() => setReportOpen(false)} targetType="story" targetId={story.id} targetLabel="story" /> : null}
      {isOwner ? <StoryViewersSheet storyId={viewersFor} onClose={() => setViewersFor(null)} /> : null}
    </div>
  );
}

function StorySlide({
  story,
  paused,
  muted,
  onMutedFallback,
  onEnd,
  index,
  count,
}: {
  story: Story;
  paused: boolean;
  muted: boolean;
  onMutedFallback: () => void;
  onEnd: () => void;
  index: number;
  count: number;
}) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [aspect, setAspect] = useState(9 / 16);
  const [progress, setProgress] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const pausedRef = useRef(paused);
  const endRef = useRef(onEnd);
  useEffect(() => {
    pausedRef.current = paused;
    endRef.current = onEnd;
  });

  // Play/pause the video with the player state.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !ready) return;
    if (paused) v.pause();
    else
      void v.play().catch(() => {
        v.muted = true;
        onMutedFallback();
        void v.play().catch(() => undefined);
      });
  }, [paused, ready, onMutedFallback]);

  // Progress loop.
  useEffect(() => {
    if (!ready && !failed) return;
    let raf = 0;
    let last = performance.now();
    let elapsed = 0;
    let done = false;
    const loop = (t: number) => {
      const dt = t - last;
      last = t;
      let p: number;
      const v = videoRef.current;
      if (story.media_kind === "video" && v && !failed) {
        const total = Math.min(Number.isFinite(v.duration) && v.duration > 0 ? v.duration * 1000 : MAX_VIDEO_MS, MAX_VIDEO_MS);
        p = (v.currentTime * 1000) / total;
      } else {
        if (!pausedRef.current) elapsed += dt;
        p = elapsed / IMAGE_STORY_MS;
      }
      setProgress(Math.min(1, p));
      if (p >= 1 && !done) {
        done = true;
        endRef.current();
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [ready, failed, story.media_kind]);

  const src = mediaUrl(story.media_id);

  return (
    <>
      <div className="absolute inset-0">
        <FitFrame aspect={aspect}>
          {failed || !src ? null : story.media_kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt={story.caption || "Story"}
              draggable={false}
              className="absolute inset-0 h-full w-full object-contain"
              onLoad={(e) => {
                const i = e.currentTarget;
                if (i.naturalWidth && i.naturalHeight) setAspect(i.naturalWidth / i.naturalHeight);
                setReady(true);
              }}
              onError={() => setFailed(true)}
            />
          ) : (
            <video
              ref={videoRef}
              src={src}
              playsInline
              muted={muted}
              preload="auto"
              disablePictureInPicture
              controlsList="nodownload"
              className="absolute inset-0 h-full w-full object-contain"
              onLoadedMetadata={(e) => {
                const v = e.currentTarget;
                if (v.videoWidth && v.videoHeight) setAspect(v.videoWidth / v.videoHeight);
              }}
              onCanPlay={() => setReady(true)}
              onEnded={() => endRef.current()}
              onError={() => setFailed(true)}
            />
          )}
          <OverlayLayer overlays={story.overlays} />
        </FitFrame>
      </div>
      {!ready && !failed ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-white/70" aria-label="Loading story" />
        </div>
      ) : null}
      {failed ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-8 text-center text-sm text-white/70" role="alert">
          This story couldn&apos;t be loaded.
        </div>
      ) : null}
      <div className="absolute inset-x-0 top-0 z-20 flex gap-1 px-3 pt-[max(0.5rem,env(safe-area-inset-top))]" aria-hidden>
        {Array.from({ length: count }).map((_, i) => (
          <span key={i} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/30">
            <span className="block h-full rounded-full bg-white" style={{ width: `${(i < index ? 1 : i === index ? progress : 0) * 100}%` }} />
          </span>
        ))}
      </div>
    </>
  );
}
