"use client";

import { useQuery } from "@tanstack/react-query";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { qk } from "@/lib/query-keys";
import type { ConversationSummary } from "@/types/models";

/** Conversation list (shared with the Chats feature so the cache is reused). */
export function useConversations(archived = false) {
  return useQuery({
    queryKey: qk.conversations(archived),
    queryFn: async () => {
      const { data, error } = await getSupabaseBrowserClient().rpc("my_conversations", { p_archived: archived, p_limit: 100 });
      if (error) throw error;
      return (data ?? []) as ConversationSummary[];
    },
  });
}

export function useUnreadNotificationCount(userId: string) {
  return useQuery({
    queryKey: qk.unreadNotifications,
    queryFn: async () => {
      const { count, error } = await getSupabaseBrowserClient()
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .is("read_at", null);
      if (error) throw error;
      return count ?? 0;
    },
    refetchInterval: 120_000,
  });
}

export function usePendingRequestCount(userId: string) {
  return useQuery({
    queryKey: [...qk.friendRequests, "count"],
    queryFn: async () => {
      const { count, error } = await getSupabaseBrowserClient()
        .from("friend_requests")
        .select("id", { count: "exact", head: true })
        .eq("receiver_id", userId)
        .eq("status", "pending");
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function useUnopenedSnapCount(userId: string) {
  return useQuery({
    queryKey: ["snaps", "unopened-count"],
    queryFn: async () => {
      const { count, error } = await getSupabaseBrowserClient()
        .from("snap_recipients")
        .select("snap_id", { count: "exact", head: true })
        .eq("recipient_id", userId)
        .eq("status", "delivered");
      if (error) throw error;
      return count ?? 0;
    },
  });
}

export function useNavBadges(userId: string) {
  const conversations = useConversations(false);
  const notifications = useUnreadNotificationCount(userId);
  const requests = usePendingRequestCount(userId);
  const snaps = useUnopenedSnapCount(userId);
  const chats = (conversations.data ?? []).reduce(
    (sum, c) => sum + (c.muted_until && new Date(c.muted_until) > new Date() ? 0 : Number(c.unread_count)),
    0,
  );
  return { chats, notifications: notifications.data ?? 0, requests: requests.data ?? 0, snaps: snaps.data ?? 0 };
}
