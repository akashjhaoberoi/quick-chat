"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useInfiniteQuery, useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { differenceInCalendarDays, isToday } from "date-fns";
import { Bell, CheckCheck, Settings, X } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/controls";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/ui/feedback";
import { api, errorMessage } from "@/lib/api/client";
import { qk } from "@/lib/query-keys";
import { cn, displayName, relativeTime } from "@/lib/utils";
import type { AppNotification, UserCard } from "@/types/models";
import { countLabel, metaFor, safeUrl } from "./meta";
import { PushStatusCard } from "./push-status-card";
import type { NotificationsPage } from "./types";

type Filter = "all" | "unread";
type Data = InfiniteData<NotificationsPage, string | null>;

const listKey = (filter: Filter) => [...qk.notifications, "list", filter] as const;

/** Calls onVisible when scrolled near the end of the list. */
function AutoLoad({ onVisible }: { onVisible: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef(onVisible);
  useEffect(() => {
    cb.current = onVisible;
  });
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && cb.current(), { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} aria-hidden />;
}

function groupOf(iso: string): "Today" | "This week" | "Earlier" {
  const d = new Date(iso);
  if (isToday(d)) return "Today";
  return differenceInCalendarDays(new Date(), d) < 7 ? "This week" : "Earlier";
}

function NotificationItem({
  n,
  actor,
  index,
  onOpen,
  onDelete,
}: {
  n: AppNotification;
  actor: UserCard | undefined;
  index: number;
  onOpen: (n: AppNotification) => void;
  onDelete: (n: AppNotification) => void;
}) {
  const meta = metaFor(n.type);
  const Icon = meta.icon;
  const unread = !n.read_at;
  const count = countLabel(n);
  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -24 }}
      transition={{ duration: 0.18, delay: Math.min(index, 10) * 0.02 }}
      className={cn("group relative flex items-start gap-3 rounded-2xl px-3 py-3 transition-colors hover:bg-surface-2", unread && "bg-brand-soft/60")}
    >
      <button type="button" onClick={() => onOpen(n)} className="flex min-w-0 flex-1 items-start gap-3 text-left">
        <span className="relative shrink-0">
          {actor ? (
            <Avatar mediaId={actor.avatar_media_id} name={displayName(actor)} size="md" />
          ) : (
            <span className="flex h-10 w-10 items-center justify-center rounded-full text-white" style={{ background: meta.color }}>
              <Icon className="h-5 w-5" aria-hidden />
            </span>
          )}
          {actor ? (
            <span
              className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full text-white ring-2 ring-surface"
              style={{ background: meta.color }}
              aria-hidden
            >
              <Icon className="h-3 w-3" />
            </span>
          ) : null}
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn("block text-sm", unread ? "font-bold" : "font-semibold")}>{n.title}</span>
          {n.body ? <span className="mt-0.5 line-clamp-2 block text-sm text-ink-2">{n.body}</span> : null}
          <span className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-muted">
            <time dateTime={n.created_at}>{relativeTime(n.created_at)}</time>
            {count ? <span className="font-semibold text-ink-2">· {count}</span> : null}
          </span>
        </span>
        {unread ? <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-brand" aria-label="Unread" /> : null}
      </button>
      <button
        type="button"
        onClick={() => onDelete(n)}
        aria-label={`Delete notification: ${n.title}`}
        className="shrink-0 rounded-full p-1.5 text-muted opacity-100 hover:bg-surface-3 hover:text-ink focus:opacity-100 md:opacity-0 md:group-hover:opacity-100"
      >
        <X className="h-4 w-4" />
      </button>
    </motion.li>
  );
}

export function NotificationsView() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");

  const query = useInfiniteQuery({
    queryKey: listKey(filter),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api.get<NotificationsPage>("/api/notifications", { cursor: pageParam ?? undefined, unread: filter === "unread" ? 1 : undefined }),
    getNextPageParam: (last) => last.nextCursor,
  });

  /** Optimistically patch every cached list page. */
  const patch = (fn: (n: AppNotification) => AppNotification | null) => {
    queryClient.setQueriesData<Data>({ queryKey: [...qk.notifications, "list"] }, (data) =>
      data
        ? {
            ...data,
            pages: data.pages.map((p) => ({ ...p, items: p.items.map(fn).filter((x): x is AppNotification => x !== null) })),
          }
        : data,
    );
  };
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: qk.notifications });
    void queryClient.invalidateQueries({ queryKey: qk.unreadNotifications });
  };

  const markRead = useMutation({
    mutationFn: (ids?: string[]) => api.post<{ updated: number }>("/api/notifications/read", ids ? { ids } : {}),
    onMutate: (ids) => {
      const now = new Date().toISOString();
      patch((n) => (!n.read_at && (!ids || ids.includes(n.id)) ? { ...n, read_at: now } : n));
    },
    onSettled: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/notifications/${id}`),
    onMutate: (id) => patch((n) => (n.id === id ? null : n)),
    onSettled: refresh,
  });

  const { groups, actors, hasUnread } = useMemo(() => {
    const pages = query.data?.pages ?? [];
    const actors: Record<string, UserCard> = Object.assign({}, ...pages.map((p) => p.actors));
    const items = pages.flatMap((p) => p.items);
    const groups: { label: string; items: AppNotification[] }[] = [];
    for (const n of items) {
      const label = groupOf(n.created_at);
      const last = groups[groups.length - 1];
      if (last?.label === label) last.items.push(n);
      else groups.push({ label, items: [n] });
    }
    return { groups, actors, hasUnread: items.some((n) => !n.read_at) };
  }, [query.data]);

  const open = (n: AppNotification) => {
    if (!n.read_at) markRead.mutate([n.id]);
    const url = safeUrl(n.data?.url);
    if (url) router.push(url);
  };

  let index = 0;

  return (
    <PageContainer>
      <PageHeader
        title="Notifications"
        actions={
          <>
            <Button size="sm" variant="ghost" onClick={() => markRead.mutate(undefined)} disabled={!hasUnread || markRead.isPending}>
              <CheckCheck className="h-4 w-4" /> <span className="hidden sm:inline">Mark all as read</span>
            </Button>
            <Link
              href="/settings/notifications"
              aria-label="Notification settings"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-2 hover:bg-surface-2 hover:text-ink"
            >
              <Settings className="h-5 w-5" />
            </Link>
          </>
        }
      />
      <div className="space-y-4 px-4 pb-10 md:px-6">
        <PushStatusCard />
        <Tabs
          ariaLabel="Notification filter"
          value={filter}
          onChange={setFilter}
          className="max-w-xs"
          items={[
            { value: "all", label: "All" },
            { value: "unread", label: "Unread" },
          ]}
        />
        {query.isPending ? (
          <ListSkeleton rows={8} />
        ) : query.isError ? (
          <ErrorState description={errorMessage(query.error)} onRetry={() => void query.refetch()} />
        ) : groups.length === 0 ? (
          <EmptyState
            icon={<Bell />}
            title={filter === "unread" ? "You're all caught up" : "No notifications yet"}
            description={
              filter === "unread"
                ? "No unread notifications."
                : "Friend requests, Snaps, mentions and more will show up here."
            }
          />
        ) : (
          <div className="space-y-5">
            {groups.map((g) => (
              <section key={g.label} aria-labelledby={`ng-${g.label}`}>
                <h2 id={`ng-${g.label}`} className="mb-1 px-1 text-xs font-bold uppercase tracking-wider text-muted">
                  {g.label}
                </h2>
                <ul className="space-y-0.5">
                  <AnimatePresence initial={false}>
                    {g.items.map((n) => (
                      <NotificationItem
                        key={n.id}
                        n={n}
                        actor={n.actor_id ? actors[n.actor_id] : undefined}
                        index={index++}
                        onOpen={open}
                        onDelete={(x) => remove.mutate(x.id)}
                      />
                    ))}
                  </AnimatePresence>
                </ul>
              </section>
            ))}
            {query.hasNextPage ? (
              <div className="flex justify-center">
                <AutoLoad onVisible={() => !query.isFetchingNextPage && void query.fetchNextPage()} />
                <Button variant="outline" onClick={() => void query.fetchNextPage()} loading={query.isFetchingNextPage}>
                  Load more
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </div>
    </PageContainer>
  );
}
