"use client";

import { useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { qk } from "@/lib/query-keys";
import { fetchInbox, fetchScore, fetchSent, fetchStreaks } from "./data";

// ---------------------------------------------------------------------------
// Shared 1-second clock (one interval for every countdown on screen).
// ---------------------------------------------------------------------------
let clockNow = 0;
let clockTimer: number | undefined;
const clockSubs = new Set<() => void>();

function subscribeClock(cb: () => void) {
  clockSubs.add(cb);
  if (clockTimer === undefined) {
    clockNow = Date.now();
    clockTimer = window.setInterval(() => {
      clockNow = Date.now();
      clockSubs.forEach((fn) => fn());
    }, 1000);
  }
  return () => {
    clockSubs.delete(cb);
    if (clockSubs.size === 0 && clockTimer !== undefined) {
      window.clearInterval(clockTimer);
      clockTimer = undefined;
    }
  };
}

function clockSnapshot() {
  if (!clockNow) clockNow = Date.now();
  return clockNow;
}

/** Current time in ms, re-rendering once per second while mounted. */
export function useNow(): number {
  return useSyncExternalStore(subscribeClock, clockSnapshot, () => 0);
}

export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Queries (browser Supabase client; RLS restricts rows to the caller)
// ---------------------------------------------------------------------------
export function useSnapInbox(userId: string) {
  return useQuery({
    queryKey: qk.snapsInbox,
    queryFn: () => fetchInbox(getSupabaseBrowserClient(), userId),
    staleTime: 10_000,
  });
}

export function useSentSnaps(userId: string) {
  return useQuery({
    queryKey: qk.snapsSent,
    queryFn: () => fetchSent(getSupabaseBrowserClient(), userId),
    staleTime: 10_000,
  });
}

export function useStreaks() {
  return useQuery({ queryKey: qk.streaks, queryFn: () => fetchStreaks(getSupabaseBrowserClient()) });
}

export function useScore(userId: string) {
  return useQuery({ queryKey: qk.score, queryFn: () => fetchScore(getSupabaseBrowserClient(), userId) });
}
