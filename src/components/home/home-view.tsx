"use client";

import { useMemo, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { differenceInMinutes } from "date-fns";
import { ArrowRight, Camera, ChevronRight, Compass, Flame, MessageCirclePlus, MessagesSquare, UserPlus, Users, Zap } from "lucide-react";
import { StoryCarousel } from "@/components/stories/story-carousel";
import { AddFriendButton } from "@/components/friends/add-friend-button";
import { useFriendRequests, useFriends, useFriendSuggestions, useStreaks } from "@/components/friends/hooks";
import { useMe } from "@/components/providers/session-provider";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/ui/feedback";
import { useConversations, useUnopenedSnapCount } from "@/hooks/use-badges";
import { usePresence } from "@/hooks/use-presence";
import { errorMessage } from "@/lib/api/client";
import { cn, displayName, isOnline, lastSeenLabel, shortTime } from "@/lib/utils";
import type { ConversationSummary } from "@/types/models";

const STREAK_WINDOW_MIN = 6 * 60;
const noop = () => () => {};

function useGreeting() {
  return useSyncExternalStore(
    noop,
    () => {
      const h = new Date().getHours();
      return h < 5 ? "Good night" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
    },
    () => "Hello",
  );
}

function Card({ title, icon, action, children, className, delay = 0 }: {
  title: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay, ease: "easeOut" }}
      className={cn("rounded-3xl border border-border bg-surface p-4 shadow-[var(--shadow-soft)]", className)}
      aria-label={title}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-display text-base font-bold">
          {icon}
          {title}
        </h2>
        {action}
      </div>
      {children}
    </motion.section>
  );
}

function SeeAll({ href, label = "See all" }: { href: string; label?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-0.5 text-xs font-semibold text-brand hover:underline">
      {label} <ChevronRight className="h-3.5 w-3.5" aria-hidden />
    </Link>
  );
}

const QUICK_ACTIONS = [
  { href: "/chats?new=1", label: "New chat", icon: MessageCirclePlus, tone: "bg-[#2e90fa]/12 text-[#2e90fa]" },
  { href: "/camera", label: "Camera", icon: Camera, tone: "bg-[#ff5e7e]/12 text-[#ff5e7e]" },
  { href: "/friends?tab=add", label: "Add friends", icon: UserPlus, tone: "bg-[#7c5cff]/12 text-[#7c5cff]" },
  { href: "/discover", label: "Discover", icon: Compass, tone: "bg-[#12b76a]/12 text-[#12b76a]" },
];

function QuickActions() {
  return (
    <motion.nav
      aria-label="Quick actions"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.05 }}
      className="grid grid-cols-4 gap-2 sm:gap-3"
    >
      {QUICK_ACTIONS.map(({ href, label, icon: Icon, tone }) => (
        <Link
          key={href}
          href={href}
          className="group flex flex-col items-center gap-2 rounded-3xl border border-border bg-surface px-2 py-3 text-center shadow-[var(--shadow-soft)] transition-transform hover:-translate-y-0.5"
        >
          <span className={cn("flex h-11 w-11 items-center justify-center rounded-2xl transition-transform group-hover:scale-105", tone)}>
            <Icon className="h-5 w-5" aria-hidden />
          </span>
          <span className="text-xs font-semibold">{label}</span>
        </Link>
      ))}
    </motion.nav>
  );
}

function preview(c: ConversationSummary, meId: string) {
  if (!c.last_message_id) return c.type === "group" ? `${c.member_count} members` : "Say hi 👋";
  if (c.last_message_deleted) return "Message deleted";
  const mine = c.last_message_sender_id === meId ? "You: " : "";
  const byType: Record<string, string> = {
    image: "📷 Photo", video: "🎬 Video", voice: "🎤 Voice message", gif: "GIF", sticker: "Sticker", document: "📄 Document",
    location: "📍 Location", contact: "👤 Contact", call: "📞 Call", story_reply: "Replied to a story",
  };
  const text = c.last_message_type && byType[c.last_message_type] ? byType[c.last_message_type] : (c.last_message_body ?? "");
  return mine + text;
}

function RecentChats() {
  const me = useMe();
  const convs = useConversations(false);
  return (
    <Card title="Recent chats" icon={<MessagesSquare className="h-4 w-4 text-brand" />} action={<SeeAll href="/chats" />} delay={0.15}>
      {convs.isPending ? (
        <ListSkeleton rows={3} />
      ) : convs.isError ? (
        <ErrorState description={errorMessage(convs.error)} onRetry={() => void convs.refetch()} />
      ) : convs.data.length === 0 ? (
        <EmptyState
          icon={<MessagesSquare />}
          title="No chats yet"
          description="Start a conversation with a friend."
          action={<SeeAll href="/chats?new=1" label="New chat" />}
          className="py-6"
        />
      ) : (
        <ul className="-mx-2 space-y-0.5">
          {convs.data.slice(0, 5).map((c) => {
            const unread = Number(c.unread_count);
            return (
              <li key={c.conversation_id}>
                <Link href={`/chats/${c.conversation_id}`} className="flex items-center gap-3 rounded-2xl px-2 py-2 hover:bg-surface-2">
                  <Avatar mediaId={c.avatar_media_id} name={c.title} size="md" />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className={cn("truncate text-sm", unread ? "font-bold" : "font-semibold")}>
                        {c.title}
                        {c.streak_count ? <span className="ml-1.5 text-xs font-semibold text-ink-2">🔥 {c.streak_count}</span> : null}
                      </span>
                      <time dateTime={c.last_message_at} className="shrink-0 text-[11px] text-muted">
                        {shortTime(c.last_message_at)}
                      </time>
                    </span>
                    <span className="flex items-center justify-between gap-2">
                      <span className={cn("truncate text-xs", unread ? "font-semibold text-ink" : "text-muted")}>{preview(c, me.user.id)}</span>
                      {unread ? (
                        <span className="min-w-[20px] shrink-0 rounded-full bg-accent px-1.5 text-center text-[11px] font-bold leading-5 text-white" aria-label={`${unread} unread`}>
                          {unread > 99 ? "99+" : unread}
                        </span>
                      ) : null}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function StreaksEndingSoon() {
  const streaks = useStreaks();
  const ending = useMemo(() => {
    const now = new Date();
    return (streaks.data ?? [])
      .filter((s) => s.count > 0 && s.expires_at && differenceInMinutes(new Date(s.expires_at), now) <= STREAK_WINDOW_MIN)
      .sort((a, b) => new Date(a.expires_at!).getTime() - new Date(b.expires_at!).getTime());
  }, [streaks.data]);
  if (!ending.length) return null;
  return (
    <Card title="Streaks ending soon" icon={<Flame className="h-4 w-4 text-[#ef6820]" />} action={<SeeAll href="/snaps?tab=streaks" />} delay={0.1}>
      <ul className="-mx-2 space-y-0.5">
        {ending.slice(0, 5).map((s) => {
          const mins = Math.max(0, differenceInMinutes(new Date(s.expires_at!), new Date()));
          const left = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m left` : `${mins}m left`;
          return (
            <li key={s.friend_id}>
              <Link href={`/camera?to=${s.friend_id}`} className="flex items-center gap-3 rounded-2xl px-2 py-2 hover:bg-surface-2">
                <Avatar mediaId={s.avatar_media_id} name={displayName(s)} size="md" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">
                    {displayName(s)} <span className="text-ink-2">🔥 {s.count}</span>
                  </span>
                  <span className="block text-xs font-medium text-[#ef6820]">
                    ⏳ {left}
                    {s.i_sent_today ? " · waiting for them" : ""}
                  </span>
                </span>
                <span className="inline-flex items-center gap-1 rounded-xl bg-brand px-3 py-1.5 text-xs font-bold text-brand-ink">
                  <Camera className="h-3.5 w-3.5" aria-hidden /> Snap
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

function SnapsAndRequests() {
  const me = useMe();
  const snaps = useUnopenedSnapCount(me.user.id);
  const requests = useFriendRequests();
  const incoming = requests.data?.incoming ?? [];
  const unopened = snaps.data ?? 0;
  if (!unopened && !incoming.length) return null;
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3, delay: 0.08 }} className="grid gap-3 sm:grid-cols-2">
      {unopened ? (
        <Link href="/snaps" className="brand-gradient flex items-center gap-3 rounded-3xl p-4 text-white shadow-[var(--shadow-pop)] transition-transform hover:-translate-y-0.5">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/20">
            <Zap className="h-5 w-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-base font-bold">
              {unopened} new {unopened === 1 ? "Snap" : "Snaps"}
            </span>
            <span className="block text-xs text-white/80">Tap to open before they expire</span>
          </span>
          <ArrowRight className="h-5 w-5" aria-hidden />
        </Link>
      ) : null}
      {incoming.length ? (
        <Link
          href="/friends?tab=requests"
          className="flex items-center gap-3 rounded-3xl border border-border bg-surface p-4 shadow-[var(--shadow-soft)] transition-transform hover:-translate-y-0.5"
        >
          <span className="flex -space-x-3">
            {incoming.slice(0, 3).map((r) => (
              <Avatar key={r.id} mediaId={r.avatar_media_id} name={displayName(r)} size="sm" className="rounded-full ring-2 ring-surface" />
            ))}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-base font-bold">
              {incoming.length} friend {incoming.length === 1 ? "request" : "requests"}
            </span>
            <span className="block truncate text-xs text-muted">From {incoming.slice(0, 2).map((r) => displayName(r)).join(", ")}</span>
          </span>
          <ChevronRight className="h-5 w-5 text-muted" aria-hidden />
        </Link>
      ) : null}
    </motion.div>
  );
}

function OnlineFriends({ delay }: { delay: number }) {
  const friends = useFriends();
  const presence = usePresence((friends.data ?? []).map((f) => f.id));
  const rows = useMemo(
    () =>
      (friends.data ?? [])
        .map((f) => {
          const seen = presence.data?.get(f.id) ?? f.last_seen_at;
          return { f, seen, online: isOnline(seen) };
        })
        .sort((a, b) => Number(b.online) - Number(a.online) || (b.seen ?? "").localeCompare(a.seen ?? ""))
        .slice(0, 8),
    [friends.data, presence.data],
  );
  const onlineCount = rows.filter((r) => r.online).length;
  return (
    <Card
      title={onlineCount ? `Online now · ${onlineCount}` : "Friends"}
      icon={<span className={cn("h-2.5 w-2.5 rounded-full", onlineCount ? "bg-success" : "bg-surface-3")} aria-hidden />}
      action={<SeeAll href="/friends" />}
      delay={delay}
    >
      {friends.isPending ? (
        <ListSkeleton rows={3} />
      ) : friends.isError ? (
        <ErrorState description={errorMessage(friends.error)} onRetry={() => void friends.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState icon={<Users />} title="No friends yet" action={<SeeAll href="/friends?tab=add" label="Add friends" />} className="py-6" />
      ) : (
        <ul className="-mx-2 space-y-0.5">
          {rows.map(({ f, seen, online }) => (
            <li key={f.id}>
              <Link href={`/profile/${f.username}`} className="flex items-center gap-3 rounded-2xl px-2 py-1.5 hover:bg-surface-2">
                <Avatar mediaId={f.avatar_media_id} name={displayName(f)} size="sm" online={online} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{displayName(f)}</span>
                  <span className="block truncate text-xs text-muted">{lastSeenLabel(seen) ?? `@${f.username}`}</span>
                </span>
                {f.streak_count > 0 ? <span className="text-xs font-semibold text-ink-2">🔥 {f.streak_count}</span> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function SuggestionsCard({ delay }: { delay: number }) {
  const suggestions = useFriendSuggestions(5);
  if (suggestions.isSuccess && suggestions.data.length === 0) return null;
  return (
    <Card title="People you may know" icon={<UserPlus className="h-4 w-4 text-brand" />} action={<SeeAll href="/friends?tab=suggestions" />} delay={delay}>
      {suggestions.isPending ? (
        <ListSkeleton rows={3} />
      ) : suggestions.isError ? (
        <ErrorState description={errorMessage(suggestions.error)} onRetry={() => void suggestions.refetch()} />
      ) : (
        <ul className="-mx-2 space-y-0.5">
          {suggestions.data.map((s) => (
            <li key={s.id} className="flex items-center gap-3 rounded-2xl px-2 py-1.5 hover:bg-surface-2">
              <Link href={`/profile/${s.username}`} className="flex min-w-0 flex-1 items-center gap-3">
                <Avatar mediaId={s.avatar_media_id} name={displayName(s)} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{displayName(s)}</span>
                  <span className="block truncate text-xs text-muted">
                    {s.mutual_count ? `${s.mutual_count} mutual ${s.mutual_count === 1 ? "friend" : "friends"}` : `@${s.username}`}
                  </span>
                </span>
              </Link>
              <AddFriendButton userId={s.id} hint="none" />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function HomeView() {
  const me = useMe();
  const greeting = useGreeting();
  const first = displayName(me.profile).split(/\s+/)[0];

  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-10 pt-4 md:px-6 md:pt-6">
      <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_340px] xl:gap-6">
        <div className="min-w-0 space-y-5">
          <motion.header initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
            <p className="text-sm font-semibold text-muted">{greeting},</p>
            <h1 className="font-display text-3xl font-extrabold tracking-tight">
              <span className="brand-text">{first}</span> 👋
            </h1>
          </motion.header>

          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, delay: 0.03 }} className="-mx-4 md:mx-0">
            <StoryCarousel />
          </motion.div>

          <QuickActions />
          <SnapsAndRequests />
          <StreaksEndingSoon />
          <RecentChats />

          {/* Contextual cards move to the right panel on wide screens. */}
          <div className="space-y-5 xl:hidden">
            <OnlineFriends delay={0.2} />
            <SuggestionsCard delay={0.25} />
          </div>
        </div>
        <aside className="hidden space-y-5 xl:block" aria-label="Friends activity">
          <div className="sticky top-6 space-y-5">
            <OnlineFriends delay={0.12} />
            <SuggestionsCard delay={0.18} />
          </div>
        </aside>
      </div>
    </div>
  );
}
