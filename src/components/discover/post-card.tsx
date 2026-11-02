"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { BadgeCheck, Bookmark, Flag, Heart, MessageCircle, MoreHorizontal, Pause, Plus, Send, Trash2, Volume2, VolumeX } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Menu } from "@/components/ui/controls";
import { useConfirm } from "@/components/ui/confirm";
import { ReportDialog } from "@/components/moderation/report-dialog";
import { useSession } from "@/components/providers/session-provider";
import { cn, compactNumber, displayName, mediaUrl, relativeTime } from "@/lib/utils";
import type { FeedPost } from "@/types/models";
import { Caption } from "./caption";
import { usePostActions } from "./post-actions";

function RailButton({ label, onClick, children, count, active }: { label: string; onClick: () => void; children: ReactNode; count?: number; active?: boolean }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} aria-pressed={active} className="flex flex-col items-center gap-1 text-white">
      <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/35 backdrop-blur transition-transform active:scale-90 lg:bg-surface-2 lg:text-ink [&>svg]:h-6 [&>svg]:w-6">
        {children}
      </span>
      {count !== undefined ? <span className="text-xs font-bold drop-shadow lg:text-ink-2 lg:drop-shadow-none">{compactNumber(count)}</span> : null}
    </button>
  );
}

/**
 * One full-height Discover item. Media is only mounted when `mountMedia`
 * (active ±1); videos play muted while `active` (≥60% visible).
 */
export function PostCard({
  post, active, mountMedia, muted, onToggleMute, onOpenComments, className,
}: {
  post: FeedPost;
  active: boolean;
  mountMedia: boolean;
  muted: boolean;
  onToggleMute: () => void;
  onOpenComments: () => void;
  className?: string;
}) {
  const { me } = useSession();
  const confirm = useConfirm();
  const actions = usePostActions(post);
  const videoRef = useRef<HTMLVideoElement>(null);
  const tapTimer = useRef<number | undefined>(undefined);
  const [paused, setPaused] = useState(false);
  const [hearts, setHearts] = useState<{ id: number; x: number; y: number }[]>([]);
  const [reporting, setReporting] = useState(false);
  const isMine = me?.user.id === post.author_id;
  const { recordView } = actions;

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = muted;
    if (active && !paused) void v.play().catch(() => undefined);
    else v.pause();
  }, [active, paused, muted, mountMedia]);

  useEffect(() => {
    if (!active) return;
    const t = window.setTimeout(recordView, 2000);
    return () => window.clearTimeout(t);
  }, [active, recordView]);

  const onTap = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (tapTimer.current) {
      window.clearTimeout(tapTimer.current);
      tapTimer.current = undefined;
      setHearts((h) => [...h, { id: Date.now(), x, y }]);
      if (!post.liked) actions.like.mutate();
      return;
    }
    tapTimer.current = window.setTimeout(() => {
      tapTimer.current = undefined;
      if (post.media_kind === "video") setPaused((p) => !p);
    }, 260);
  };

  return (
    <article className={cn("relative flex h-full w-full items-center justify-center gap-4", className)} aria-label={`Post by @${post.username}`}>
      <div className="relative h-full w-full overflow-hidden bg-black lg:aspect-[9/16] lg:h-full lg:w-auto lg:rounded-3xl lg:shadow-[var(--shadow-pop)]">
        <div className="absolute inset-0" onClick={onTap} role="presentation">
          {mountMedia ? (
            post.media_kind === "video" ? (
              <video
                ref={videoRef}
                src={mediaUrl(post.media_id)}
                className="h-full w-full object-contain"
                playsInline
                loop
                muted={muted}
                preload="metadata"
              />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mediaUrl(post.media_id)} alt={post.caption || `Post by @${post.username}`} className="h-full w-full object-contain" decoding="async" />
            )
          ) : null}
        </div>

        <AnimatePresence>
          {hearts.map((h) => (
            <motion.span
              key={h.id}
              aria-hidden
              initial={{ opacity: 0, scale: 0.4, rotate: -15 }}
              animate={{ opacity: 1, scale: 1.3, rotate: 0 }}
              exit={{ opacity: 0, scale: 1.8, y: -60 }}
              transition={{ type: "spring", stiffness: 300, damping: 15 }}
              onAnimationComplete={() => setHearts((all) => all.filter((x) => x.id !== h.id))}
              className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-1/2 text-accent"
              style={{ left: h.x, top: h.y }}
            >
              <Heart className="h-24 w-24 fill-current drop-shadow-lg" />
            </motion.span>
          ))}
        </AnimatePresence>

        {post.media_kind === "video" && paused ? (
          <span aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/40 p-5 text-white">
            <Pause className="h-10 w-10" />
          </span>
        ) : null}

        {post.media_kind === "video" ? (
          <button
            type="button"
            onClick={onToggleMute}
            aria-label={muted ? "Unmute" : "Mute"}
            className="absolute right-3 top-3 z-10 rounded-full bg-black/40 p-2.5 text-white backdrop-blur"
          >
            {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </button>
        ) : null}

        <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent p-4 pr-20 pt-16 text-white lg:pr-4">
          <div className="pointer-events-auto flex items-center gap-2">
            <Link href={`/profile/${post.username}`} className="flex min-w-0 items-center gap-2">
              <Avatar mediaId={post.avatar_media_id} name={displayName(post)} size="sm" />
              <span className="truncate font-bold">{displayName(post)}</span>
              {post.is_verified ? <BadgeCheck className="h-4 w-4 shrink-0 text-brand" aria-label="Verified" /> : null}
            </Link>
            {!isMine && !post.following ? (
              <button
                type="button"
                onClick={() => actions.follow.mutate()}
                disabled={actions.follow.isPending}
                className="rounded-full border border-white/70 px-3 py-0.5 text-xs font-bold hover:bg-white/15"
              >
                Follow
              </button>
            ) : null}
          </div>
          <Caption text={post.caption} className="pointer-events-auto mt-2 line-clamp-3 text-sm" />
          <p className="mt-1 text-xs text-white/70">
            {relativeTime(post.created_at)} · {compactNumber(post.view_count)} views
          </p>
        </div>
      </div>

      <div className="absolute bottom-24 right-2 flex flex-col items-center gap-4 lg:static lg:self-end lg:pb-6">
        <Link href={`/profile/${post.username}`} className="relative" aria-label={`@${post.username}'s profile`}>
          <Avatar mediaId={post.avatar_media_id} name={displayName(post)} size="md" className="ring-2 ring-white lg:ring-border" />
          {!isMine && !post.following ? (
            <span
              role="button"
              tabIndex={0}
              aria-label={`Follow @${post.username}`}
              onClick={(e) => {
                e.preventDefault();
                actions.follow.mutate();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  actions.follow.mutate();
                }
              }}
              className="absolute -bottom-2 left-1/2 flex h-5 w-5 -translate-x-1/2 items-center justify-center rounded-full bg-accent text-white"
            >
              <Plus className="h-3.5 w-3.5" />
            </span>
          ) : null}
        </Link>
        <RailButton label={post.liked ? "Unlike" : "Like"} active={post.liked} count={post.like_count} onClick={() => actions.like.mutate()}>
          <motion.span key={String(post.liked)} initial={{ scale: 0.6 }} animate={{ scale: 1 }} className="inline-flex">
            <Heart className={cn("h-6 w-6", post.liked && "fill-accent text-accent")} />
          </motion.span>
        </RailButton>
        <RailButton label="Comments" count={post.comment_count} onClick={onOpenComments}>
          <MessageCircle />
        </RailButton>
        <RailButton label={post.saved ? "Remove from saved" : "Save"} active={post.saved} onClick={() => actions.save.mutate()}>
          <Bookmark className={cn(post.saved && "fill-warning text-warning")} />
        </RailButton>
        <RailButton label="Share" count={post.share_count} onClick={() => void actions.share()}>
          <Send />
        </RailButton>
        <Menu
          label="More options"
          trigger={
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur lg:bg-surface-2 lg:text-ink">
              <MoreHorizontal className="h-6 w-6" />
            </span>
          }
          items={
            isMine
              ? [
                  {
                    label: "Delete post",
                    icon: <Trash2 />,
                    danger: true,
                    onSelect: async () => {
                      if (await confirm({ title: "Delete this post?", description: "It will be removed from Discover for everyone.", confirmLabel: "Delete", danger: true }))
                        actions.remove.mutate();
                    },
                  },
                ]
              : [{ label: "Report post", icon: <Flag />, danger: true, onSelect: () => setReporting(true) }]
          }
        />
      </div>
      <ReportDialog open={reporting} onClose={() => setReporting(false)} targetType="post" targetId={post.id} targetLabel="post" />
    </article>
  );
}
