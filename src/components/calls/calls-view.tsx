"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useInfiniteQuery } from "@tanstack/react-query";
import { MessageCircle, Phone, PhoneIncoming, PhoneMissed, PhoneOutgoing, Video } from "lucide-react";
import { motion } from "motion/react";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { Avatar } from "@/components/ui/avatar";
import { Tabs } from "@/components/ui/controls";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, ListSkeleton, SetupNotice } from "@/components/ui/feedback";
import { useAppConfig } from "@/hooks/use-app-config";
import { api, errorMessage } from "@/lib/api/client";
import { qk } from "@/lib/query-keys";
import { cn, formatDuration, relativeTime } from "@/lib/utils";
import type { CallHistoryItem } from "@/types/models";
import { CallButtons } from "./call-buttons";
import { isLiveCall } from "./types";

type Filter = "all" | "missed";

function isMissed(c: CallHistoryItem) {
  return !c.is_outgoing && (c.my_status === "missed" || (c.status === "missed" && c.my_status !== "declined"));
}

function describe(c: CallHistoryItem): string {
  if (isLiveCall(c.status)) return c.status === "active" ? "Ongoing" : "Ringing";
  if (isMissed(c)) return "Missed";
  if (c.is_outgoing) {
    if (c.status === "missed" || c.status === "cancelled") return "No answer";
    if (c.status === "declined") return "Declined";
    return "Outgoing";
  }
  if (c.my_status === "declined") return "Declined";
  return "Incoming";
}

export function CallsView() {
  const config = useAppConfig();
  const [filter, setFilter] = useState<Filter>("all");
  const query = useInfiniteQuery({
    queryKey: [...qk.calls, "history"],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => api.get<{ items: CallHistoryItem[]; nextCursor: string | null }>("/api/calls", { before: pageParam }),
    getNextPageParam: (last) => last.nextCursor,
  });

  const items = useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data]);
  const visible = filter === "missed" ? items.filter(isMissed) : items;
  const live = items.filter((c) => isLiveCall(c.status) && c.my_status !== "declined" && (c.status === "active" || c.is_outgoing || c.my_status === "ringing"));
  const missedCount = items.filter(isMissed).length;

  return (
    <PageContainer>
      <PageHeader title="Calls" subtitle="Voice and video calls with your friends and groups" />
      <div className="space-y-4 px-4 pb-8 md:px-6">
        {config.data && !config.data.features.calls ? (
          <SetupNotice feature="Audio & video calls">
            This server doesn&apos;t have a calling backend (LiveKit) configured, so new calls can&apos;t be placed. Your call history is still shown below.
          </SetupNotice>
        ) : null}

        {live.map((c) => (
          <motion.div
            key={c.call_id}
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="brand-gradient flex items-center gap-3 rounded-3xl p-3 text-white shadow-[var(--shadow-soft)]"
          >
            <span className="relative">
              <span aria-hidden className="absolute inset-0 animate-pulse-ring rounded-full bg-white/40" />
              <Avatar mediaId={c.avatar_media_id} name={c.title} size="md" className="relative" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-bold">{c.title}</p>
              <p className="text-xs opacity-85">{c.status === "active" ? `${c.kind === "video" ? "Video" : "Voice"} call in progress` : "Ringing…"}</p>
            </div>
            <Link
              href={`/calls/${c.call_id}${c.my_status === "joined" ? "" : "?accept=1"}`}
              className="rounded-2xl bg-white px-4 py-2 text-sm font-bold text-[#14121e] hover:bg-white/90"
            >
              {c.my_status === "ringing" ? "Answer" : "Rejoin"}
            </Link>
          </motion.div>
        ))}

        <Tabs<Filter>
          ariaLabel="Call filter"
          value={filter}
          onChange={setFilter}
          items={[
            { value: "all", label: "All" },
            { value: "missed", label: "Missed", count: missedCount },
          ]}
          className="max-w-xs"
        />

        {query.isPending ? (
          <ListSkeleton rows={7} />
        ) : query.isError ? (
          <ErrorState description={errorMessage(query.error)} onRetry={() => void query.refetch()} />
        ) : visible.length === 0 ? (
          <EmptyState
            icon={filter === "missed" ? <PhoneMissed /> : <Phone />}
            title={filter === "missed" ? "No missed calls" : "No calls yet"}
            description={
              filter === "missed"
                ? "You're all caught up."
                : "Start a voice or video call from any chat using the call buttons in the chat header."
            }
            action={
              filter === "all" ? (
                <Link href="/chats" className="text-sm font-semibold text-brand hover:underline">
                  Open your chats
                </Link>
              ) : undefined
            }
          />
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-3xl border border-border bg-surface">
            {visible.map((c) => {
              const missed = isMissed(c);
              const DirIcon = missed ? PhoneMissed : c.is_outgoing ? PhoneOutgoing : PhoneIncoming;
              const duration =
                c.started_at && c.ended_at ? formatDuration((new Date(c.ended_at).getTime() - new Date(c.started_at).getTime()) / 1000) : null;
              return (
                <li key={c.call_id} className="flex items-center gap-3 p-3 sm:px-4">
                  <Avatar mediaId={c.avatar_media_id} name={c.title} size="md" />
                  <div className="min-w-0 flex-1">
                    <p className={cn("truncate font-semibold", missed && "text-danger")}>{c.title}</p>
                    <p className="flex items-center gap-1.5 text-xs text-muted">
                      <DirIcon className={cn("h-3.5 w-3.5 shrink-0", missed ? "text-danger" : "text-muted")} aria-hidden />
                      {c.kind === "video" ? <Video className="h-3.5 w-3.5 shrink-0" aria-label="Video call" /> : <Phone className="h-3.5 w-3.5 shrink-0" aria-label="Voice call" />}
                      <span className="truncate">
                        {describe(c)}
                        {duration ? ` · ${duration}` : ""} · {relativeTime(c.created_at)}
                      </span>
                    </p>
                  </div>
                  <Link
                    href={`/chats/${c.conversation_id}`}
                    aria-label={`Open chat with ${c.title}`}
                    title="Open chat"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-2 hover:bg-surface-2 hover:text-brand"
                  >
                    <MessageCircle className="h-[18px] w-[18px]" />
                  </Link>
                  <CallButtons conversationId={c.conversation_id} compact />
                </li>
              );
            })}
          </ul>
        )}

        {query.hasNextPage ? (
          <div className="flex justify-center">
            <Button variant="outline" loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
              Load older calls
            </Button>
          </div>
        ) : null}
      </div>
    </PageContainer>
  );
}
