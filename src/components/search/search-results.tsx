"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Hash, Heart, Play, Users } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { AddFriendButton } from "@/components/friends/add-friend-button";
import { hintFor } from "@/components/friends/discover-tabs";
import { UserRow } from "@/components/friends/user-row";
import type { UserSearchResult } from "@/components/friends/types";
import { api } from "@/lib/api/client";
import { cn, compactNumber, displayName, mediaUrl, relativeTime, shortTime } from "@/lib/utils";
import type { CreatorHit, GroupHit, HashtagHit, MessageHit, PostHit, SearchCategory, StoryHit } from "./types";

/** Highlights query words inside plain text (rendered as text nodes; no HTML injection). */
export function Highlight({ text, q }: { text: string; q: string }) {
  const words = q.trim().split(/\s+/).filter((w) => w.length > 0).map((w) => w.replace(/[.*+?^${}()|[\]\\#@]/g, "\\$&"));
  if (!words.length) return <>{text}</>;
  const re = new RegExp(`(${words.join("|")})`, "gi");
  return (
    <>
      {text.split(re).map((part, i) =>
        i % 2 === 1 ? (
          <mark key={i} className="rounded bg-brand-soft px-0.5 text-ink">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

function RowLink({ href, onClick, children }: { href: string; onClick?: () => void; children: ReactNode }) {
  return (
    <li>
      <Link href={href} onClick={onClick} className="flex items-center gap-3 rounded-2xl px-2 py-2 hover:bg-surface-2">
        {children}
      </Link>
    </li>
  );
}

function FollowButton({ creator }: { creator: CreatorHit }) {
  const queryClient = useQueryClient();
  const [following, setFollowing] = useState(creator.following);
  const toggle = useMutation({
    mutationFn: () => api.post<{ following: boolean }>(`/api/users/${creator.id}/follow`),
    onSuccess: (res) => {
      setFollowing(res.following);
      void queryClient.invalidateQueries({ queryKey: ["profile"] });
    },
  });
  return (
    <Button size="sm" variant={following ? "secondary" : "primary"} loading={toggle.isPending} onClick={() => toggle.mutate()}>
      {following ? "Following" : "Follow"}
    </Button>
  );
}

export function UserHits({ items, onPick }: { items: UserSearchResult[]; onPick?: () => void }) {
  return (
    <ul className="space-y-0.5" onClick={onPick}>
      {items.map((u, i) => (
        <UserRow key={u.id} index={i} user={u} actions={<AddFriendButton userId={u.id} hint={hintFor(u)} />} />
      ))}
    </ul>
  );
}

export function CreatorHits({ items, onPick }: { items: CreatorHit[]; onPick?: () => void }) {
  return (
    <ul className="space-y-0.5" onClick={onPick}>
      {items.map((c, i) => (
        <UserRow
          key={c.id}
          index={i}
          user={c}
          subtitle={`@${c.username} · ${compactNumber(c.follower_count)} ${c.follower_count === 1 ? "follower" : "followers"}`}
          actions={<FollowButton creator={c} />}
        />
      ))}
    </ul>
  );
}

export function GroupHits({ items, q, onPick }: { items: GroupHit[]; q: string; onPick?: () => void }) {
  return (
    <ul className="space-y-0.5">
      {items.map((g) => (
        <RowLink key={g.conversation_id} href={`/chats/${g.conversation_id}`} onClick={onPick}>
          <Avatar mediaId={g.avatar_media_id} name={g.name} size="md" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">
              <Highlight text={g.name} q={q} />
            </span>
            <span className="flex items-center gap-1 text-xs text-muted">
              <Users className="h-3.5 w-3.5" aria-hidden /> {g.member_count} {g.member_count === 1 ? "member" : "members"}
            </span>
          </span>
        </RowLink>
      ))}
    </ul>
  );
}

export function MessageHits({ items, q, onPick }: { items: MessageHit[]; q: string; onPick?: () => void }) {
  return (
    <ul className="space-y-0.5">
      {items.map((m) => (
        <RowLink key={m.id} href={`/chats/${m.conversation_id}?m=${m.id}`} onClick={onPick}>
          <Avatar mediaId={m.conversation_avatar_media_id} name={m.conversation_title} size="md" />
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline justify-between gap-2">
              <span className="truncate text-sm font-semibold">{m.conversation_title}</span>
              <time dateTime={m.created_at} className="shrink-0 text-[11px] text-muted">
                {shortTime(m.created_at)}
              </time>
            </span>
            <span className="line-clamp-2 block text-xs text-ink-2">
              {m.sender_name && m.conversation_type === "group" ? <span className="font-semibold">{m.sender_name}: </span> : null}
              {m.sender_name === "You" && m.conversation_type !== "group" ? <span className="font-semibold">You: </span> : null}
              <Highlight text={m.body ?? ""} q={q} />
            </span>
          </span>
        </RowLink>
      ))}
    </ul>
  );
}

export function StoryHits({ items, q, onPick }: { items: StoryHit[]; q: string; onPick?: () => void }) {
  return (
    <ul className="space-y-0.5">
      {items.map((s) => (
        <RowLink key={s.id} href={`/stories/view/${s.user_id}`} onClick={onPick}>
          <Avatar mediaId={s.avatar_media_id} name={displayName(s)} size="md" ring="unseen" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{displayName(s)}</span>
            <span className="block truncate text-xs text-muted">
              {s.caption ? <Highlight text={s.caption} q={q} /> : `@${s.username}`} · {relativeTime(s.created_at)}
            </span>
          </span>
        </RowLink>
      ))}
    </ul>
  );
}

export function PostHits({ items, onPick, className }: { items: PostHit[]; onPick?: () => void; className?: string }) {
  return (
    <ul className={cn("grid grid-cols-3 gap-1.5 sm:gap-2", className)}>
      {items.map((p) => (
        <li key={p.id}>
          <Link
            href={`/discover/${p.id}`}
            onClick={onPick}
            className="group relative block aspect-[3/4] overflow-hidden rounded-2xl bg-surface-3"
            aria-label={`Post by @${p.username}${p.caption ? `: ${p.caption}` : ""}`}
          >
            {p.media_kind === "video" ? (
              <video src={mediaUrl(p.media_id)} muted playsInline preload="metadata" className="h-full w-full object-cover" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mediaUrl(p.media_id)} alt="" loading="lazy" className="h-full w-full object-cover transition-transform group-hover:scale-105" />
            )}
            <span className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent p-2 text-[11px] font-semibold text-white">
              <span className="truncate">@{p.username}</span>
              <span className="flex items-center gap-0.5">
                <Heart className="h-3 w-3" aria-hidden /> {compactNumber(p.like_count)}
              </span>
            </span>
            {p.media_kind === "video" ? <Play className="absolute right-2 top-2 h-4 w-4 text-white drop-shadow" aria-hidden /> : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function HashtagHits({ items, onPick }: { items: HashtagHit[]; onPick?: () => void }) {
  return (
    <ul className="space-y-0.5">
      {items.map((h) => (
        <RowLink key={h.tag} href={`/discover/tag/${encodeURIComponent(h.tag)}`} onClick={onPick}>
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-soft text-brand">
            <Hash className="h-5 w-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">#{h.tag}</span>
            <span className="block text-xs text-muted">
              {h.capped ? `${h.post_count}+` : compactNumber(h.post_count)} {h.post_count === 1 ? "post" : "posts"}
            </span>
          </span>
        </RowLink>
      ))}
    </ul>
  );
}

export const CATEGORY_LABEL: Record<SearchCategory, string> = {
  users: "People",
  groups: "Groups",
  messages: "Messages",
  creators: "Creators",
  stories: "Stories",
  posts: "Posts",
  hashtags: "Tags",
};

