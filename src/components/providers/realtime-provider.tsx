"use client";

import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { qk } from "@/lib/query-keys";

/**
 * One realtime channel per signed-in user (no duplicate subscriptions).
 * Supabase evaluates RLS for every change, so users only receive rows they
 * are allowed to read. Feature code subscribes with `useRealtimeEvent`.
 */
export type RealtimeTable =
  | "messages" | "message_reactions" | "conversation_members" | "conversations" | "groups"
  | "notifications" | "snap_recipients" | "calls" | "call_participants" | "friend_requests" | "location_shares";

export type RealtimeEvent = RealtimePostgresChangesPayload<Record<string, unknown>> & { table: RealtimeTable };
type Listener = (event: RealtimeEvent) => void;

const TABLES: RealtimeTable[] = [
  "messages", "message_reactions", "conversation_members", "conversations", "groups",
  "notifications", "snap_recipients", "calls", "call_participants", "friend_requests", "location_shares",
];

const RealtimeContext = createContext<{ subscribe: (table: RealtimeTable, fn: Listener) => () => void } | null>(null);

export function RealtimeProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const queryClient = useQueryClient();
  const listeners = useRef(new Map<RealtimeTable, Set<Listener>>());

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let deliveredTimer: number | undefined;
    const markDelivered = () => {
      window.clearTimeout(deliveredTimer);
      deliveredTimer = window.setTimeout(() => void supabase.rpc("mark_delivered"), 800);
    };

    let channel = supabase.channel(`user:${userId}`);
    for (const table of TABLES) {
      channel = channel.on("postgres_changes", { event: "*", schema: "public", table }, (payload) => {
        const event = { ...payload, table } as RealtimeEvent;
        // Global cache maintenance; feature listeners can do finer updates.
        switch (table) {
          case "messages":
          case "message_reactions":
          case "conversation_members":
          case "conversations":
          case "groups":
            void queryClient.invalidateQueries({ queryKey: qk.conversationsAll });
            if (table === "messages" && payload.eventType === "INSERT" && (payload.new as { sender_id?: string }).sender_id !== userId) {
              markDelivered();
            }
            break;
          case "notifications":
            void queryClient.invalidateQueries({ queryKey: qk.notifications });
            break;
          case "snap_recipients":
            void queryClient.invalidateQueries({ queryKey: ["snaps"] });
            void queryClient.invalidateQueries({ queryKey: qk.streaks });
            break;
          case "friend_requests":
            void queryClient.invalidateQueries({ queryKey: qk.friendRequests });
            void queryClient.invalidateQueries({ queryKey: qk.friends });
            break;
          case "calls":
          case "call_participants":
            void queryClient.invalidateQueries({ queryKey: qk.calls });
            break;
        }
        listeners.current.get(table)?.forEach((fn) => fn(event));
      });
    }
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") markDelivered();
    });

    // Presence heartbeat (privacy-aware "last active" is computed server-side).
    const beat = () => {
      if (document.visibilityState === "visible") void supabase.rpc("heartbeat");
    };
    beat();
    const interval = window.setInterval(beat, 60_000);
    document.addEventListener("visibilitychange", beat);

    return () => {
      window.clearInterval(interval);
      window.clearTimeout(deliveredTimer);
      document.removeEventListener("visibilitychange", beat);
      void supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  const subscribe = (table: RealtimeTable, fn: Listener) => {
    const set = listeners.current.get(table) ?? new Set<Listener>();
    set.add(fn);
    listeners.current.set(table, set);
    return () => {
      set.delete(fn);
    };
  };

  return <RealtimeContext.Provider value={{ subscribe }}>{children}</RealtimeContext.Provider>;
}

/** Subscribe to realtime changes for a table. The handler may change between renders. */
export function useRealtimeEvent(table: RealtimeTable, handler: Listener) {
  const ctx = useContext(RealtimeContext);
  const ref = useRef(handler);
  useEffect(() => {
    ref.current = handler;
  });
  useEffect(() => {
    if (!ctx) return;
    return ctx.subscribe(table, (e) => ref.current(e));
  }, [ctx, table]);
}
