"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence } from "motion/react";
import { AtSign, Ban, Search, Sparkles, UserX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/ui/feedback";
import { api, errorMessage } from "@/lib/api/client";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { qk } from "@/lib/query-keys";
import { relativeTime } from "@/lib/utils";
import { AddFriendButton } from "./add-friend-button";
import { useFriendSuggestions, type Relationship } from "./hooks";
import { UserRow } from "./user-row";
import type { BlockedUser, UserSearchResult } from "./types";

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function hintFor(u: Pick<UserSearchResult, "is_friend" | "request_status">): Relationship {
  return u.is_friend ? "friends" : (u.request_status ?? "none");
}

/** Friends > Add: find people by username or display name. */
export function AddTab() {
  const [q, setQ] = useState("");
  const term = useDebounced(q.trim().replace(/^@/, ""), 300);
  const results = useQuery({
    queryKey: qk.search("add-friends", term),
    enabled: term.length >= 1,
    queryFn: async () => {
      const { data, error } = await getSupabaseBrowserClient().rpc("search_users", { p_query: term, p_limit: 30, p_offset: 0 });
      if (error) throw error;
      return (data ?? []) as UserSearchResult[];
    },
    placeholderData: (prev) => prev,
  });

  return (
    <section aria-label="Add friends">
      <label className="relative mb-3 block">
        <span className="sr-only">Search by username or name</span>
        <AtSign className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
        <input
          type="search"
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by username or name"
          autoComplete="off"
          autoCapitalize="none"
          className="h-12 w-full rounded-2xl border border-border bg-surface pl-9 pr-3 text-sm focus:border-brand focus:outline-none focus:ring-4 focus:ring-[var(--ring)]"
        />
      </label>
      {!term ? (
        <>
          <EmptyState icon={<Search />} title="Find your friends" description="Search for a username like @alex or a display name." className="py-8" />
          <SuggestionsList limit={8} title="People you may know" />
        </>
      ) : results.isPending ? (
        <ListSkeleton rows={5} />
      ) : results.isError ? (
        <ErrorState description={errorMessage(results.error)} onRetry={() => void results.refetch()} />
      ) : results.data.length === 0 ? (
        <EmptyState icon={<UserX />} title="No one found" description={`No discoverable account matches “${term}”.`} />
      ) : (
        <ul className="space-y-0.5" aria-busy={results.isFetching}>
          {results.data.map((u, i) => (
            <UserRow key={u.id} index={i} user={u} actions={<AddFriendButton userId={u.id} hint={hintFor(u)} />} />
          ))}
        </ul>
      )}
    </section>
  );
}

function SuggestionsList({ limit, title }: { limit: number; title?: string }) {
  const suggestions = useFriendSuggestions(limit);
  if (suggestions.isPending) return <ListSkeleton rows={4} />;
  if (suggestions.isError) return <ErrorState description={errorMessage(suggestions.error)} onRetry={() => void suggestions.refetch()} />;
  if (suggestions.data.length === 0) {
    return title ? null : (
      <EmptyState icon={<Sparkles />} title="No suggestions right now" description="As you add friends, we'll suggest people you may know." />
    );
  }
  return (
    <section aria-label={title ?? "Suggestions"}>
      {title ? <h2 className="mb-2 px-1 text-xs font-bold uppercase tracking-wider text-muted">{title}</h2> : null}
      <ul className="space-y-0.5">
        <AnimatePresence initial={false}>
          {suggestions.data.map((s, i) => (
            <UserRow
              key={s.id}
              index={i}
              user={s}
              subtitle={s.mutual_count > 0 ? `@${s.username} · ${s.mutual_count} mutual ${s.mutual_count === 1 ? "friend" : "friends"}` : `@${s.username}`}
              actions={<AddFriendButton userId={s.id} hint="none" />}
            />
          ))}
        </AnimatePresence>
      </ul>
    </section>
  );
}

/** Friends > Suggestions. */
export function SuggestionsTab() {
  return <SuggestionsList limit={30} />;
}

/** Friends > Blocked: people you've blocked, with unblock. */
export function BlockedTab() {
  const queryClient = useQueryClient();
  const blocked = useQuery({ queryKey: qk.blocked, queryFn: () => api.get<BlockedUser[]>("/api/users/blocked") });
  const unblock = useMutation({
    mutationFn: (id: string) => api.delete(`/api/users/${id}/block`),
    onSuccess: () => {
      toast("Unblocked");
      void queryClient.invalidateQueries({ queryKey: qk.suggestions });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: qk.blocked }),
  });

  if (blocked.isPending) return <ListSkeleton rows={3} />;
  if (blocked.isError) return <ErrorState description={errorMessage(blocked.error)} onRetry={() => void blocked.refetch()} />;
  if (blocked.data.length === 0) {
    return <EmptyState icon={<Ban />} title="No blocked accounts" description="People you block can't find you, message you or see your stories." />;
  }
  return (
    <ul className="space-y-0.5" aria-label="Blocked accounts">
      <AnimatePresence initial={false}>
        {blocked.data.map((b, i) => (
          <UserRow
            key={b.id}
            index={i}
            user={b}
            subtitle={`@${b.username} · blocked ${relativeTime(b.blocked_at)}`}
            actions={
              <Button size="sm" variant="secondary" loading={unblock.isPending && unblock.variables === b.id} onClick={() => unblock.mutate(b.id)}>
                Unblock
              </Button>
            }
          />
        ))}
      </AnimatePresence>
    </ul>
  );
}
