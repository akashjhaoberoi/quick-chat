"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api/client";
import { qk } from "@/lib/query-keys";
import type { Call, CallKind } from "@/types/models";
import type { CallDetails } from "./types";

/** Calls started from this tab: their "ringing" row must not pop the incoming overlay. */
export const locallyStartedCalls = new Set<string>();

export function startCall(conversationId: string, kind: CallKind) {
  return api.post<Call>("/api/calls", { conversationId, kind }).then((call) => {
    locallyStartedCalls.add(call.id);
    return call;
  });
}

export function useCallDetails(callId: string | null | undefined, opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: qk.call(callId ?? ""),
    queryFn: () => api.get<CallDetails>(`/api/calls/${callId}`),
    enabled: Boolean(callId) && (opts?.enabled ?? true),
    staleTime: 5_000,
  });
}

/** Best-effort leave when the page is closing (no response needed). */
export function beaconLeave(callId: string) {
  const url = `/api/calls/${callId}/leave`;
  try {
    if (typeof navigator !== "undefined" && navigator.sendBeacon && navigator.sendBeacon(url)) return;
  } catch {
    // fall through to keepalive fetch
  }
  void fetch(url, { method: "POST", keepalive: true, credentials: "same-origin" }).catch(() => undefined);
}

export function callStatusLabel(status: Call["status"], opts?: { outgoing?: boolean }): string {
  switch (status) {
    case "ended":
      return "Call ended";
    case "missed":
      return opts?.outgoing ? "No answer" : "Missed call";
    case "declined":
      return "Call declined";
    case "cancelled":
      return "Call cancelled";
    case "active":
      return "In progress";
    default:
      return "Ringing";
  }
}
