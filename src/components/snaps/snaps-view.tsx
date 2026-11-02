"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, Eye, Film, ImageIcon, Inbox, RotateCcw, Send, Timer } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { Avatar } from "@/components/ui/avatar";
import { Badge, Tabs } from "@/components/ui/controls";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/ui/feedback";
import { useMe } from "@/components/providers/session-provider";
import { useRealtimeEvent } from "@/components/providers/realtime-provider";
import { api } from "@/lib/api/client";
import { qk } from "@/lib/query-keys";
import { cn, displayName, relativeTime } from "@/lib/utils";
import type { UserCard } from "@/types/models";
import { canReplay, effectiveStatus, type InboxSnap, type OpenedSnap, type SentSnap, type SentSnapRecipient } from "./data";
import { useNow, useSentSnaps, useSnapInbox } from "./hooks";
import { SnapViewer } from "./snap-viewer";
import { StreaksPanel } from "./streaks-panel";

type Tab = "received" | "sent" | "streaks";
const TABS: Tab[] = ["received", "sent", "streaks"];

function KindIcon({ kind, className }: { kind: "image" | "video"; className?: string }) {
  return kind === "video" ? <Film className={className} aria-label="Video" /> : <ImageIcon className={className} aria-label="Photo" />;
}

/** /snaps — Received / Sent / Streaks (+ score). Supports ?tab= and ?open={snapId}. */
export function SnapsView() {
  const me = useMe();
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const tabParam = params.get("tab");
  const tab: Tab = tabParam === "sent" || tabParam === "streaks" ? tabParam : "received";
  const openParam = params.get("open");

  const inbox = useSnapInbox(me.user.id);
  const [viewing, setViewing] = useState<{ snap: OpenedSnap; sender: UserCard | null } | null>(null);

  const open = useMutation({
    mutationFn: (v: { snapId: string; replay?: boolean; sender: UserCard | null }) =>
      api.post<OpenedSnap>(`/api/snaps/${v.snapId}/open`, { replay: v.replay ?? false }),
    onSuccess: (snap, v) => setViewing({ snap, sender: v.sender }),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ["snaps"] }),
  });

  // Deep link from a notification: /snaps?open={snapId}
  const handledOpen = useRef<string | null>(null);
  useEffect(() => {
    if (!openParam || handledOpen.current === openParam || inbox.isPending) return;
    handledOpen.current = openParam;
    const item = inbox.data?.find((s) => s.snap_id === openParam);
    open.mutate({ snapId: openParam, sender: item?.snap.sender ?? null });
    router.replace("/snaps");
  }, [openParam, inbox.isPending, inbox.data, open, router]);

  const setTab = (t: Tab) => router.replace(t === "received" ? "/snaps" : `/snaps?tab=${t}`, { scroll: false });
  const unopened = (inbox.data ?? []).filter((s) => s.status === "delivered").length;

  return (
    <PageContainer>
      <PageHeader
        title="Snaps"
        subtitle="Disappearing photos and videos"
        actions={
          <Link href="/camera" className="brand-gradient inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-white shadow-[var(--shadow-soft)]">
            <Camera className="h-4 w-4" /> New Snap
          </Link>
        }
      />
      <div className="px-4 md:px-6">
        <Tabs
          ariaLabel="Snaps"
          value={tab}
          onChange={setTab}
          items={TABS.map((t) => ({
            value: t,
            label: t === "received" ? "Received" : t === "sent" ? "Sent" : "Streaks",
            count: t === "received" ? unopened : undefined,
          }))}
        />
      </div>
      <div className="px-2 py-4 md:px-4" role="tabpanel">
        {tab === "received" ? (
          <ReceivedList
            inbox={inbox}
            opening={open.isPending ? open.variables?.snapId ?? null : null}
            onOpen={(item, replay) => open.mutate({ snapId: item.snap_id, replay, sender: item.snap.sender })}
          />
        ) : tab === "sent" ? (
          <SentList />
        ) : (
          <div className="px-2">
            <StreaksPanel />
          </div>
        )}
      </div>
      {viewing ? (
        <SnapViewer
          key={`${viewing.snap.snapId}-${viewing.snap.viewExpiresAt}`}
          snap={viewing.snap}
          sender={viewing.sender}
          onClose={() => {
            setViewing(null);
            void queryClient.invalidateQueries({ queryKey: ["snaps"] });
          }}
        />
      ) : null}
    </PageContainer>
  );
}

function ReceivedList({
  inbox,
  opening,
  onOpen,
}: {
  inbox: ReturnType<typeof useSnapInbox>;
  opening: string | null;
  onOpen: (item: InboxSnap, replay?: boolean) => void;
}) {
  const now = useNow();
  if (inbox.isPending) return <ListSkeleton rows={5} />;
  if (inbox.isError) return <ErrorState description="We couldn't load your Snaps." onRetry={() => void inbox.refetch()} />;
  const items = [...(inbox.data ?? [])].sort((a, b) => {
    const ua = a.status === "delivered" ? 0 : 1;
    const ub = b.status === "delivered" ? 0 : 1;
    return ua - ub || new Date(b.delivered_at).getTime() - new Date(a.delivered_at).getTime();
  });
  if (items.length === 0) {
    return (
      <EmptyState
        icon={<Inbox />}
        title="No Snaps yet"
        description="When friends send you Snaps they'll show up here. They disappear after you view them."
        action={
          <Link href="/camera" className="text-sm font-semibold text-brand">
            Send a Snap
          </Link>
        }
      />
    );
  }
  return (
    <ul className="space-y-1">
      {items.map((item) => {
        const status = effectiveStatus(item, item.snap.expires_at, now);
        const inWindow = item.view_expires_at !== null && new Date(item.view_expires_at).getTime() > now;
        const replayable = canReplay(item, now) && !inWindow;
        const clickable = status === "delivered" || inWindow;
        const sender = item.snap.sender;
        const unopened = status === "delivered";
        return (
          <li key={item.snap_id} className="flex items-center gap-2 rounded-2xl pr-2 hover:bg-surface-2">
            <button
              type="button"
              disabled={!clickable || opening === item.snap_id}
              onClick={() => onOpen(item)}
              className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl p-3 text-left disabled:cursor-default"
              aria-label={unopened ? `Open Snap from ${displayName(sender)}` : `Snap from ${displayName(sender)}, ${status}`}
            >
              <Avatar mediaId={sender?.avatar_media_id} name={displayName(sender)} size="md" />
              <span className="min-w-0 flex-1">
                <span className={cn("block truncate", unopened ? "font-bold" : "font-semibold")}>{displayName(sender)}</span>
                <span className="flex items-center gap-1.5 text-xs text-muted">
                  <span
                    className={cn(
                      "inline-flex h-3.5 w-3.5 items-center justify-center rounded-[4px]",
                      unopened ? (item.snap.media_kind === "video" ? "bg-[#8e72ff]" : "bg-accent") : "border-2 border-current",
                    )}
                    aria-hidden
                  />
                  {opening === item.snap_id
                    ? "Opening…"
                    : unopened
                      ? `New ${item.snap.media_kind === "video" ? "video" : "Snap"} · Tap to view`
                      : status === "expired"
                        ? "Expired"
                        : inWindow
                          ? "Opened · tap to keep viewing"
                          : `Opened ${item.opened_at ? relativeTime(item.opened_at) : ""}`}
                  <span aria-hidden>·</span>
                  {relativeTime(item.delivered_at)}
                </span>
              </span>
              <KindIcon kind={item.snap.media_kind} className="h-4 w-4 shrink-0 text-muted" />
            </button>
            {replayable ? (
              <button
                type="button"
                onClick={() => onOpen(item, true)}
                disabled={opening === item.snap_id}
                className="flex items-center gap-1 rounded-full bg-brand-soft px-3 py-1.5 text-xs font-bold text-brand"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Replay
              </button>
            ) : null}
            {sender ? (
              <Link href={`/camera?to=${sender.id}`} className="rounded-full p-2 text-muted hover:bg-surface-3 hover:text-ink" aria-label={`Reply to ${displayName(sender)} with a Snap`}>
                <Camera className="h-4 w-4" />
              </Link>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function RecipientStatus({ r, expiresAt, now }: { r: SentSnapRecipient; expiresAt: string; now: number }) {
  const status = effectiveStatus(r, expiresAt, now);
  return (
    <li className="flex items-center gap-2 py-1.5">
      <Avatar mediaId={r.recipient?.avatar_media_id} name={displayName(r.recipient)} size="xs" />
      <span className="min-w-0 flex-1 truncate text-sm">{displayName(r.recipient)}</span>
      {r.screenshot_at ? (
        <Badge tone="warning" className="gap-1">📸 Screenshot</Badge>
      ) : null}
      {r.replay_count > 0 ? <Badge tone="muted">Replayed</Badge> : null}
      {status === "opened" ? (
        <Badge tone="success" className="gap-1">
          <Eye className="h-3 w-3" /> Opened {r.opened_at ? relativeTime(r.opened_at) : ""}
        </Badge>
      ) : status === "expired" ? (
        <Badge tone="muted">Expired</Badge>
      ) : (
        <Badge tone="brand" className="gap-1">
          <Send className="h-3 w-3" /> Delivered
        </Badge>
      )}
    </li>
  );
}

function SentList() {
  const me = useMe();
  const sent = useSentSnaps(me.user.id);
  const now = useNow();
  const queryClient = useQueryClient();

  // Live per-recipient status (opened / screenshot / expired).
  useRealtimeEvent("snap_recipients", (e) => {
    void queryClient.invalidateQueries({ queryKey: qk.snapsSent });
    const row = e.new as { recipient_id?: string; screenshot_at?: string | null } | undefined;
    if (e.eventType === "UPDATE" && row?.screenshot_at && row.recipient_id !== me.user.id && Date.now() - new Date(row.screenshot_at).getTime() < 15_000) {
      toast("Someone may have taken a screenshot of your Snap", { icon: "📸", description: "Screenshot detection is best-effort." });
    }
  });

  if (sent.isPending) return <ListSkeleton rows={4} />;
  if (sent.isError) return <ErrorState description="We couldn't load your sent Snaps." onRetry={() => void sent.refetch()} />;
  if (!sent.data?.length) {
    return (
      <EmptyState
        icon={<Send />}
        title="Nothing sent yet"
        description="Snaps you send appear here with live delivery and opened status."
        action={
          <Link href="/camera" className="text-sm font-semibold text-brand">
            Open the camera
          </Link>
        }
      />
    );
  }
  return (
    <div className="space-y-3 px-2">
      {sent.data.map((s: SentSnap) => (
        <article key={s.id} className="rounded-3xl border border-border bg-surface p-4">
          <header className="mb-2 flex items-center gap-2 text-sm">
            <KindIcon kind={s.media_kind} className="h-4 w-4 text-muted" />
            <span className="font-semibold">{s.media_kind === "video" ? "Video Snap" : "Photo Snap"}</span>
            <span className="text-muted">· {relativeTime(s.created_at)}</span>
            <span className="ml-auto flex items-center gap-1 text-xs text-muted">
              {s.media_kind === "image" && s.duration_seconds ? (
                <>
                  <Timer className="h-3.5 w-3.5" /> {s.duration_seconds}s
                </>
              ) : null}
              {s.view_once ? " · View once" : s.allow_replay ? " · 1 replay" : ""}
            </span>
          </header>
          {s.caption ? <p className="mb-2 text-sm text-ink-2">“{s.caption}”</p> : null}
          <ul className="divide-y divide-border">
            {s.recipients.map((r) => (
              <RecipientStatus key={r.recipient_id} r={r} expiresAt={s.expires_at} now={now} />
            ))}
          </ul>
        </article>
      ))}
      <p className="pt-2 text-center text-xs text-muted">Screenshot alerts are best-effort: browsers can&apos;t reliably detect screenshots.</p>
    </div>
  );
}
