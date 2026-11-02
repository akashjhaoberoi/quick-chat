"use client";

import { Suspense, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useRealtimeEvent } from "@/components/providers/realtime-provider";
import { qk } from "@/lib/query-keys";
import type { AppNotification, NotificationType } from "@/types/models";
import { countLabel, safeUrl } from "./meta";

const TOAST_TYPES = new Set<NotificationType>([
  "friend_request", "friend_accepted", "snap", "mention", "story_reaction", "story_reply", "group_invite", "missed_call", "follow",
]);

function pathOf(url: string) {
  return url.split(/[?#]/)[0];
}

function Toaster() {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const seen = useRef(new Set<string>());

  useRealtimeEvent("notifications", (event) => {
    void queryClient.invalidateQueries({ queryKey: qk.unreadNotifications });
    if (event.eventType !== "INSERT" && event.eventType !== "UPDATE") return;
    const n = event.new as Partial<AppNotification>;
    if (!n.id || !n.type || !n.created_at || n.read_at) return;
    if (!TOAST_TYPES.has(n.type)) return;
    // UPDATEs re-fire aggregated rows (created_at moves to now); ignore other updates.
    if (Date.now() - new Date(n.created_at).getTime() > 60_000) return;
    const key = `${n.id}:${n.created_at}`;
    if (seen.current.has(key)) return;
    seen.current.add(key);
    if (seen.current.size > 200) seen.current = new Set([...seen.current].slice(-100));

    if (document.visibilityState !== "visible") return;
    const url = safeUrl(n.data?.url);
    if (url && pathOf(url) === pathname) return;

    const count = countLabel({ type: n.type, count: n.count ?? 1 });
    toast(n.title ?? "New notification", {
      id: key,
      description: count ? `${n.body ?? ""} · ${count}` : n.body || undefined,
      action: url ? { label: "Open", onClick: () => router.push(url) } : undefined,
    });
  });

  return null;
}

/** In-app toasts for realtime notifications. Mounted once in the app shell. */
export function NotificationToaster() {
  return (
    <Suspense fallback={null}>
      <Toaster />
    </Suspense>
  );
}
