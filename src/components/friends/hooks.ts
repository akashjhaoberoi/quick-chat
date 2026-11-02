"use client";

import { useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { qk } from "@/lib/query-keys";
import { useFriends } from "@/components/social/friend-picker";
import { useConfirm } from "@/components/ui/confirm";
import { displayName } from "@/lib/utils";
import type { Streak, UserCard } from "@/types/models";
import type { FriendList, FriendRequests, FriendSuggestion, SendRequestStatus } from "./types";

export { useFriends };

export const friendRequestsKey = [...qk.friendRequests, "list"] as const;

export function useFriendRequests() {
  return useQuery({
    queryKey: friendRequestsKey,
    queryFn: () => api.get<FriendRequests>("/api/friends/requests"),
  });
}

export function useFriendSuggestions(limit = 20) {
  return useQuery({
    queryKey: [...qk.suggestions, limit],
    queryFn: async () => {
      const { data, error } = await getSupabaseBrowserClient().rpc("friend_suggestions", { p_limit: limit });
      if (error) throw error;
      return ((data ?? []) as FriendSuggestion[]).map((s) => ({ ...s, mutual_count: Number(s.mutual_count) }));
    },
    staleTime: 5 * 60_000,
  });
}

export function useFriendLists() {
  return useQuery({ queryKey: qk.friendLists, queryFn: () => api.get<FriendList[]>("/api/friends/lists") });
}

export function useStreaks() {
  return useQuery({
    queryKey: qk.streaks,
    queryFn: async () => {
      const { data, error } = await getSupabaseBrowserClient().rpc("my_streaks");
      if (error) throw error;
      return (data ?? []) as Streak[];
    },
  });
}

export type Relationship = "self" | "friends" | "outgoing" | "incoming" | "none";

/** Live relationship lookup built from the friends + requests caches (both realtime-invalidated). */
export function useRelationships() {
  const friends = useFriends();
  const requests = useFriendRequests();
  return useMemo(() => {
    const friendIds = new Set((friends.data ?? []).map((f) => f.id));
    const incoming = new Map((requests.data?.incoming ?? []).map((r) => [r.user_id, r.id]));
    const outgoing = new Map((requests.data?.outgoing ?? []).map((r) => [r.user_id, r.id]));
    const ready = friends.isSuccess && requests.isSuccess;
    return {
      ready,
      get(userId: string, hint?: Relationship): { state: Relationship; requestId: string | null } {
        if (!ready && hint) return { state: hint, requestId: null };
        if (friendIds.has(userId)) return { state: "friends", requestId: null };
        if (incoming.has(userId)) return { state: "incoming", requestId: incoming.get(userId)! };
        if (outgoing.has(userId)) return { state: "outgoing", requestId: outgoing.get(userId)! };
        return { state: hint === "self" ? "self" : "none", requestId: null };
      },
    };
  }, [friends.data, friends.isSuccess, requests.data, requests.isSuccess]);
}

function useRefreshSocial() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.friendRequests }),
      queryClient.invalidateQueries({ queryKey: qk.friends }),
      queryClient.invalidateQueries({ queryKey: qk.suggestions }),
      queryClient.invalidateQueries({ queryKey: ["search"] }),
    ]);
}

const SEND_COPY: Record<SendRequestStatus, string> = {
  sent: "Friend request sent",
  pending: "You've already sent a request",
  accepted: "You're now friends!",
  already_friends: "You're already friends",
};

export function useSendFriendRequest() {
  const refresh = useRefreshSocial();
  return useMutation({
    mutationFn: (userId: string) => api.post<{ status: SendRequestStatus }>("/api/friends/requests", { userId }),
    onSuccess: async (res) => {
      toast.success(SEND_COPY[res.status]);
      await refresh();
    },
  });
}

export function useRespondFriendRequest() {
  const refresh = useRefreshSocial();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: "accept" | "reject" }) =>
      api.post<{ status: "accepted" | "rejected" }>(`/api/friends/requests/${id}`, { action }),
    onSuccess: async (res) => {
      if (res.status === "accepted") toast.success("Friend request accepted");
      // The RPC marks the matching notification read.
      void queryClient.invalidateQueries({ queryKey: qk.notifications });
      await refresh();
    },
  });
}

export function useCancelFriendRequest() {
  const refresh = useRefreshSocial();
  return useMutation({
    mutationFn: (id: string) => api.delete<{ status: "cancelled" }>(`/api/friends/requests/${id}`),
    onSuccess: async () => {
      toast("Request cancelled");
      await refresh();
    },
  });
}

/** Unfriend / block with confirmation dialogs. */
export function useFriendModeration() {
  const confirm = useConfirm();
  const refresh = useRefreshSocial();
  const queryClient = useQueryClient();

  const unfriend = useMutation({
    mutationFn: (userId: string) => api.delete(`/api/friends/${userId}`),
    onSuccess: async () => {
      toast("Friend removed");
      void queryClient.invalidateQueries({ queryKey: qk.streaks });
      void queryClient.invalidateQueries({ queryKey: qk.friendLists });
      await refresh();
    },
  });
  const block = useMutation({
    mutationFn: (userId: string) => api.post(`/api/users/${userId}/block`),
    onSuccess: async () => {
      toast("User blocked");
      for (const key of [qk.streaks, qk.friendLists, qk.blocked, qk.conversationsAll, qk.notifications, qk.storiesFeed]) {
        void queryClient.invalidateQueries({ queryKey: key });
      }
      await refresh();
    },
  });

  return {
    unfriend,
    block,
    async confirmUnfriend(user: Pick<UserCard, "id" | "username" | "display_name">) {
      const ok = await confirm({
        title: `Remove ${displayName(user)}?`,
        description: "You'll no longer be friends, your streak will end and they'll be removed from your lists. They won't be notified.",
        confirmLabel: "Remove friend",
        danger: true,
      });
      if (ok) unfriend.mutate(user.id);
    },
    async confirmBlock(user: Pick<UserCard, "id" | "username" | "display_name">) {
      const ok = await confirm({
        title: `Block ${displayName(user)}?`,
        description:
          "They won't be able to find you, message you, see your stories or send you requests. This also removes them as a friend. They won't be notified.",
        confirmLabel: "Block",
        danger: true,
      });
      if (ok) block.mutate(user.id);
    },
  };
}

/** Opens (or creates) a direct chat, then navigates to it. */
export function useOpenChat() {
  const router = useRouter();
  return useMutation({
    mutationFn: (userId: string) => api.post<{ id: string }>("/api/conversations", { type: "direct", userId }),
    onSuccess: (res) => router.push(`/chats/${res.id}`),
  });
}
