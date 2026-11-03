"use client";

import { useMemo, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { differenceInMinutes } from "date-fns";
import { skipToken, useInfiniteQuery, useQuery, type InfiniteData } from "@tanstack/react-query";
import {
  ArrowRight, Camera, ChevronRight, Compass, Flame, MessageCirclePlus, MessagesSquare, Phone, PhoneIncoming, PhoneMissed, Sparkles, UserPlus, Users, Video, Zap,
} from "lucide-react";
import { LogoMark } from "@/components/brand/logo";
import { useCallDetails } from "@/components/calls/call-client";
import { StoryCarousel } from "@/components/stories/story-carousel";
import { AddFriendButton } from "@/components/friends/add-friend-button";
import { useFriendRequests, useFriends, useFriendSuggestions, useStreaks } from "@/components/friends/hooks";
import { useMe } from "@/components/providers/session-provider";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/ui/feedback";
import { useConversations, useUnopenedSnapCount } from "@/hooks/use-badges";
import { usePresence } from "@/hooks/use-presence";
import { errorMessage } from "@/lib/api/client";
import { qk } from "@/lib/query-keys";
import { cn, displayName, isOnline, lastSeenLabel, relativeTime, shortTime } from "@/lib/utils";
import type { CallHistoryItem, ConversationSummary } from "@/types/models";

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
  { href: "/camera", label: "Camera", icon: Camera, tone: "bg-brand text-brand-ink" },
  { href: "/chats?new=1", label: "New chat", icon: MessageCirclePlus, tone: "bg-brand-soft text-brand" },
  { href: "/friends?tab=add", label: "Add friends", icon: UserPlus, tone: "bg-brand-soft text-brand" },
  { href: "/discover", label: "Discover", icon: Compass, tone: "bg-brand-soft text-brand" },
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
          className="group flex flex-col items-center gap-2 rounded-3xl border border-border bg-surface px-2 py-3 text-center shadow-[var(--shadow-soft)] transition-transform hover:-translate-y-0.5 hover:border-brand/60"
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
                <Link href={`/chats/${c.conversation_id}`} className={cn("flex items-center gap-3 rounded-2xl px-2 py-2 hover:bg-surface-2", unread ? "bg-brand-soft/40" : "")}>
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
                        <span className="min-w-[20px] shrink-0 rounded-full bg-accent px-1.5 text-center text-[11px] font-bold leading-5 text-brand-ink" aria-label={`${unread} unread`}>
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
    <Card title="Streaks ending soon" icon={<Flame className="h-4 w-4 text-accent" />} action={<SeeAll href="/snaps?tab=streaks" />} delay={0.1}>
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
                  <span className="block text-xs font-medium text-accent">
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
        <Link href="/snaps" className="brand-gradient flex items-center gap-3 rounded-3xl p-4 text-brand-ink shadow-[var(--shadow-soft)] transition-transform hover:-translate-y-0.5">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/35">
            <Zap className="h-5 w-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-base font-bold">
              {unopened} new {unopened === 1 ? "Snap" : "Snaps"}
            </span>
            <span className="block text-xs font-medium">Tap to open before they expire</span>
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

/* ------------------------------------------------------------------------
   Calls. Read-only views of caches the app already keeps — no new requests:
   - the shell's IncomingCallOverlay polls the user's ringing invitations;
   - the Calls page loads the call history (shown here once it is cached).
------------------------------------------------------------------------- */
type IncomingRow = { call_id: string; invited_at: string };
type CallsPage = { items: CallHistoryItem[]; nextCursor: string | null };
const MISSED_WINDOW_MIN = 24 * 60;

function isMissedCall(c: CallHistoryItem) {
  return !c.is_outgoing && (c.my_status === "missed" || (c.status === "missed" && c.my_status !== "declined"));
}

function IncomingCallBanner({ callId, userId }: { callId: string; userId: string }) {
  // Same cache entry as the incoming-call overlay, so normally no extra fetch.
  const details = useCallDetails(callId);
  const call = details.data?.call;
  const mine = details.data?.participants.find((p) => p.user_id === userId);
  if (!call || !details.data || !(call.status === "ringing" || call.status === "active") || mine?.status !== "ringing") return null;
  const { conversation, participants } = details.data;
  const caller = participants.find((p) => p.user_id === call.initiator_id)?.profile ?? null;
  const title = conversation.type === "group" ? conversation.title : displayName(caller);
  const KindIcon = call.kind === "video" ? Video : Phone;
  return (
    <div role="status" className="brand-gradient flex items-center gap-3 rounded-3xl p-3 shadow-[var(--shadow-soft)]">
      <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/40">
        <span aria-hidden className="absolute inset-0 animate-pulse-ring rounded-2xl bg-white/50" />
        <PhoneIncoming className="relative h-5 w-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-display text-sm font-bold">{title}</span>
        <span className="block text-xs font-medium">Incoming {call.kind === "video" ? "video" : "voice"} call</span>
      </span>
      <Link
        href={`/calls/${callId}?accept=1`}
        className="inline-flex min-h-11 items-center gap-1.5 rounded-2xl bg-ink px-4 text-sm font-bold text-surface hover:opacity-90"
      >
        <KindIcon className="h-4 w-4" aria-hidden /> Answer
      </Link>
    </div>
  );
}

function CallAlerts() {
  const me = useMe();
  const incoming = useQuery<IncomingRow[]>({ queryKey: [...qk.calls, "incoming", me.user.id], queryFn: skipToken });
  const history = useInfiniteQuery<CallsPage, Error, InfiniteData<CallsPage, string | null>, readonly unknown[], string | null>({
    queryKey: [...qk.calls, "history"],
    queryFn: skipToken,
    initialPageParam: null,
    getNextPageParam: (last) => last.nextCursor,
  });
  const ringingId = incoming.data?.[0]?.call_id ?? null;
  const missed = useMemo(() => {
    const now = new Date();
    return (history.data?.pages ?? [])
      .flatMap((p) => p.items)
      .filter((c) => isMissedCall(c) && differenceInMinutes(now, new Date(c.created_at)) <= MISSED_WINDOW_MIN);
  }, [history.data]);

  if (!ringingId && !missed.length) return null;
  const latest = missed[0];
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }} className="space-y-3">
      {ringingId ? <IncomingCallBanner callId={ringingId} userId={me.user.id} /> : null}
      {latest ? (
        <Link
          href="/calls"
          className="flex items-center gap-3 rounded-3xl border border-border bg-surface p-3 shadow-[var(--shadow-soft)] transition-colors hover:border-brand/60"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-danger-soft text-danger">
            <PhoneMissed className="h-5 w-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-sm font-bold">
              {missed.length} missed {missed.length === 1 ? "call" : "calls"}
            </span>
            <span className="block truncate text-xs text-muted">
              {latest.title} · {relativeTime(latest.created_at)}
            </span>
          </span>
          <ChevronRight className="h-5 w-5 text-muted" aria-hidden />
        </Link>
      ) : null}
    </motion.div>
  );
}

/** Opening hero: brand, greeting and the main Snap entry point. */
function Hero() {
  const me = useMe();
  const greeting = useGreeting();
  const first = displayName(me.profile).split(/\s+/)[0];
  return (
    <motion.header
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-surface via-surface to-brand-soft p-5 shadow-[var(--shadow-soft)] sm:p-6"
    >
      <span aria-hidden className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-brand/15 blur-2xl" />
      <div className="relative flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <p className="font-display text-[11px] font-bold uppercase tracking-[0.22em] text-brand">Quick Chat</p>
          <h1 className="mt-1.5 font-display text-2xl font-extrabold tracking-tight sm:text-3xl">
            {greeting}, <span className="brand-text">{first}</span> 👋
          </h1>
          <p className="mt-1 text-sm text-muted">Your moments. Your conversations.</p>
        </div>
        <LogoMark className="h-14 w-14 shrink-0 drop-shadow-sm sm:h-16 sm:w-16" title="" />
      </div>
      <div className="relative mt-4 flex flex-wrap gap-2">
        <Link
          href="/camera"
          className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-brand px-5 text-sm font-bold text-brand-ink shadow-[var(--shadow-soft)] transition hover:brightness-105 active:brightness-95"
        >
          <Camera className="h-5 w-5" aria-hidden /> Snap
        </Link>
        <Link
          href="/chats?new=1"
          className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-border bg-surface px-4 text-sm font-semibold text-ink transition-colors hover:border-brand/60"
        >
          <MessageCirclePlus className="h-5 w-5 text-brand" aria-hidden /> New chat
        </Link>
      </div>
    </motion.header>
  );
}

function StoriesStrip() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.03 }}
      aria-labelledby="home-stories-title"
      className="-mx-4 border-y border-border bg-surface py-3 md:mx-0 md:rounded-3xl md:border md:shadow-[var(--shadow-soft)]"
    >
      <div className="flex items-center justify-between gap-2 px-4">
        <h2 id="home-stories-title" className="flex items-center gap-2 font-display text-base font-bold">
          <Sparkles className="h-4 w-4 text-brand" aria-hidden /> Friends&apos; stories
        </h2>
        <SeeAll href="/stories" />
      </div>
      <StoryCarousel />
    </motion.section>
  );
}

export function HomeView() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 pb-10 pt-4 md:px-6 md:pt-6">
      <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_340px] xl:gap-6">
        <div className="min-w-0 space-y-5">
          <Hero />
          <CallAlerts />
          <StoriesStrip />
          <SnapsAndRequests />
          <RecentChats />
          <StreaksEndingSoon />
          <QuickActions />

          {/* Contextual cards move to the right panel on wide screens. */}
          <div className="space-y-5 xl:hidden">
            <OnlineFriends delay={0.2} />
            <SuggestionsCard delay={0.25} />
          </div>
        </div>
        <aside className="hidden space-y-5 xl:block" aria-label="Friends activity">
          {/* Clears the sticky 4rem app header. */}
          <div className="sticky top-[5.5rem] space-y-5">
            <OnlineFriends delay={0.12} />
            <SuggestionsCard delay={0.18} />
          </div>
        </aside>
      </div>
    </div>
  );
}
