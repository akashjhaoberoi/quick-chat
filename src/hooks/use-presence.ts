"use client";

import { useQuery } from "@tanstack/react-query";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { qk } from "@/lib/query-keys";

/**
 * Last-seen timestamps for the given users, filtered server-side by each
 * user's "last active" privacy setting (missing = hidden). Polled, not
 * broadcast, so hidden presence can't leak through a realtime channel.
 */
export function usePresence(userIds: (string | null | undefined)[]) {
  const ids = Array.from(new Set(userIds.filter((x): x is string => Boolean(x)))).slice(0, 200);
  return useQuery({
    queryKey: qk.presence(ids),
    enabled: ids.length > 0,
    refetchInterval: 60_000,
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await getSupabaseBrowserClient().rpc("get_presence", { p_ids: ids });
      if (error) throw error;
      return new Map((data as { user_id: string; last_seen_at: string }[]).map((r) => [r.user_id, r.last_seen_at]));
    },
  });
}
