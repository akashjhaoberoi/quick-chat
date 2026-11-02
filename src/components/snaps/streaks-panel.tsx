"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Camera, ChevronDown, Flame, History, LifeBuoy, Trophy } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { EmptyState, ErrorState, ListSkeleton, Skeleton } from "@/components/ui/feedback";
import { useMe } from "@/components/providers/session-provider";
import { api } from "@/lib/api/client";
import { qk } from "@/lib/query-keys";
import { cn, compactNumber, displayName, relativeTime } from "@/lib/utils";
import type { Streak } from "@/types/models";
import { SCORE_REASONS, SCORE_RULES } from "./data";
import { formatCountdown, useNow, useScore, useStreaks } from "./hooks";

const FOUR_HOURS = 4 * 3600 * 1000;

export function ScoreCard() {
  const me = useMe();
  const score = useScore(me.user.id);
  const [showHistory, setShowHistory] = useState(false);
  const [showRules, setShowRules] = useState(false);

  return (
    <section className="overflow-hidden rounded-3xl border border-border bg-surface shadow-[var(--shadow-soft)]" aria-labelledby="score-title">
      <div className="brand-gradient flex items-center gap-4 p-5 text-white">
        <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20">
          <Trophy className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <p id="score-title" className="text-xs font-bold uppercase tracking-wider text-white/80">
            Quick Chat score
          </p>
          {score.isPending ? (
            <Skeleton className="mt-1 h-8 w-24 bg-white/30" />
          ) : score.isError ? (
            <button type="button" onClick={() => void score.refetch()} className="text-sm underline">
              Couldn&apos;t load — retry
            </button>
          ) : (
            <p className="font-display text-3xl font-extrabold tabular-nums">{score.data.score.toLocaleString()}</p>
          )}
        </div>
      </div>
      <div className="divide-y divide-border">
        <button type="button" onClick={() => setShowHistory((v) => !v)} aria-expanded={showHistory} className="flex w-full items-center gap-2 px-5 py-3 text-sm font-semibold hover:bg-surface-2">
          <History className="h-4 w-4 text-muted" /> Recent activity
          <ChevronDown className={cn("ml-auto h-4 w-4 text-muted transition-transform", showHistory && "rotate-180")} />
        </button>
        {showHistory ? (
          <div className="px-5 py-3">
            {score.isPending ? (
              <Skeleton className="h-16" />
            ) : !score.data?.history.length ? (
              <p className="text-sm text-muted">No points yet. Send Snaps, open Snaps and post stories to earn points.</p>
            ) : (
              <ul className="max-h-72 space-y-2 overflow-y-auto scrollbar-thin">
                {score.data.history.map((h, i) => (
                  <li key={`${h.created_at}-${i}`} className="flex items-center gap-3 text-sm">
                    <span aria-hidden>{SCORE_REASONS[h.reason]?.emoji ?? "•"}</span>
                    <span className="flex-1">{SCORE_REASONS[h.reason]?.label ?? h.reason}</span>
                    <span className="text-xs text-muted">{relativeTime(h.created_at)}</span>
                    <span className={cn("w-10 text-right font-bold tabular-nums", h.delta >= 0 ? "text-success" : "text-danger")}>
                      {h.delta >= 0 ? "+" : ""}
                      {h.delta}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : null}
        <button type="button" onClick={() => setShowRules((v) => !v)} aria-expanded={showRules} className="flex w-full items-center gap-2 px-5 py-3 text-sm font-semibold hover:bg-surface-2">
          <LifeBuoy className="h-4 w-4 text-muted" /> How scoring works
          <ChevronDown className={cn("ml-auto h-4 w-4 text-muted transition-transform", showRules && "rotate-180")} />
        </button>
        {showRules ? (
          <div className="space-y-3 px-5 py-4 text-sm">
            <p className="text-muted">Points are calculated on our servers only — the app can&apos;t add points itself. Daily caps reset at midnight UTC.</p>
            <ul className="space-y-2">
              {SCORE_RULES.map((r) => (
                <li key={r.reason} className="flex gap-3">
                  <span aria-hidden>{SCORE_REASONS[r.reason].emoji}</span>
                  <span>
                    <span className="font-semibold">{SCORE_REASONS[r.reason].label}:</span> {r.points}
                    <span className="block text-xs text-muted">Cap: {r.cap}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function StreakRow({ s, now }: { s: Streak; now: number }) {
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const recover = useMutation({
    mutationFn: () => api.post<{ count: number }>(`/api/streaks/${s.friend_id}/recover`),
    onSuccess: (r) => {
      toast.success(`Streak with @${s.username} restored to 🔥 ${r.count}`);
      void queryClient.invalidateQueries({ queryKey: qk.streaks });
      void queryClient.invalidateQueries({ queryKey: qk.friends });
    },
  });

  const left = s.expires_at ? new Date(s.expires_at).getTime() - now : null;
  const urgent = left !== null && left > 0 && left < FOUR_HOURS;
  const hint = s.count > 0
    ? s.i_sent_today && s.they_sent_today
      ? "Counted for today ✓"
      : !s.i_sent_today
        ? `Snap @${s.username} to keep it`
        : `Waiting for @${s.username}`
    : `Streak of ${s.lost_count} ended`;

  const askRecover = async () => {
    const ok = await confirm({
      title: `Recover your ${s.lost_count}-day streak?`,
      description:
        "You can recover a streak of 3 days or more within 48 hours of losing it, and only once every 30 days across all your friends. After recovering, you both need to Snap each other today to keep it going.",
      confirmLabel: "Recover streak",
    });
    if (ok) recover.mutate();
  };

  return (
    <li className="flex items-center gap-3 rounded-2xl px-3 py-3 hover:bg-surface-2">
      <Link href={`/profile/${s.username}`} className="shrink-0" aria-label={`View ${displayName(s)}'s profile`}>
        <Avatar mediaId={s.avatar_media_id} name={displayName(s)} size="md" />
      </Link>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2 truncate font-semibold">
          {displayName(s)}
          {s.count > 0 ? (
            <span className="inline-flex items-center gap-0.5 text-sm font-bold text-warning" aria-label={`${s.count} day streak`}>
              🔥 {s.count}
            </span>
          ) : null}
          {urgent ? (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-warning/15 px-2 py-0.5 text-xs font-bold text-warning tabular-nums" aria-label={`Expires in ${formatCountdown(left!)}`}>
              ⏳ {formatCountdown(left!)}
            </span>
          ) : null}
        </p>
        <p className={cn("truncate text-xs", urgent && !s.i_sent_today ? "font-semibold text-warning" : "text-muted")}>{hint}</p>
      </div>
      {s.recoverable ? (
        <Button size="sm" variant="outline" onClick={() => void askRecover()} loading={recover.isPending}>
          Recover
        </Button>
      ) : null}
      <Link
        href={`/camera?to=${s.friend_id}`}
        className="brand-gradient flex h-9 w-9 items-center justify-center rounded-full text-white shadow-sm"
        aria-label={`Snap @${s.username}`}
      >
        <Camera className="h-4 w-4" />
      </Link>
    </li>
  );
}

export function StreaksPanel() {
  const streaks = useStreaks();
  const now = useNow();
  const list = (streaks.data ?? []).filter((s) => s.count > 0 || s.recoverable);

  return (
    <div className="space-y-4">
      <ScoreCard />
      <section aria-labelledby="streaks-title" className="rounded-3xl border border-border bg-surface p-2">
        <h2 id="streaks-title" className="flex items-center gap-2 px-3 pb-1 pt-3 font-display font-bold">
          <Flame className="h-5 w-5 text-warning" /> Streaks
        </h2>
        <p className="px-3 pb-2 text-xs text-muted">
          A streak day counts when you and a friend both send each other a Snap that UTC day. Miss a full day and it ends. ⏳ appears when under 4 hours remain.
        </p>
        {streaks.isPending ? (
          <ListSkeleton rows={3} />
        ) : streaks.isError ? (
          <ErrorState description="We couldn't load your streaks." onRetry={() => void streaks.refetch()} />
        ) : list.length === 0 ? (
          <EmptyState icon={<Flame />} title="No streaks yet" description="Send Snaps back and forth with a friend on consecutive days to start one." />
        ) : (
          <ul>
            {list.map((s) => (
              <StreakRow key={s.friend_id} s={s} now={now} />
            ))}
          </ul>
        )}
      </section>
      {list.length > 0 ? <p className="text-center text-xs text-muted">{compactNumber(list.filter((s) => s.count > 0).length)} active streaks</p> : null}
    </div>
  );
}
