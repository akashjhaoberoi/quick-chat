"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Search, Users } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState, ListSkeleton } from "@/components/ui/feedback";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { qk } from "@/lib/query-keys";
import { cn, displayName } from "@/lib/utils";
import type { Friend } from "@/types/models";

export function useFriends() {
  return useQuery({
    queryKey: qk.friends,
    queryFn: async () => {
      const { data, error } = await getSupabaseBrowserClient().rpc("my_friends");
      if (error) throw error;
      return (data ?? []) as Friend[];
    },
  });
}

/** Searchable multi-select list of the user's friends. */
export function FriendPicker({
  selected,
  onChange,
  max,
  exclude = [],
  className,
}: {
  selected: string[];
  onChange: (ids: string[]) => void;
  max?: number;
  exclude?: string[];
  className?: string;
}) {
  const friends = useFriends();
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (friends.data ?? []).filter(
      (f) => !exclude.includes(f.id) && (!term || f.username.includes(term) || f.display_name.toLowerCase().includes(term)),
    );
  }, [friends.data, q, exclude]);

  const toggle = (id: string) => {
    if (selected.includes(id)) onChange(selected.filter((x) => x !== id));
    else if (!max || selected.length < max) onChange([...selected, id]);
  };

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <label className="relative mb-2 block">
        <span className="sr-only">Search friends</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search friends"
          className="h-10 w-full rounded-xl border border-border bg-surface-2 pl-9 pr-3 text-sm focus:border-brand focus:outline-none"
        />
      </label>
      {friends.isPending ? (
        <ListSkeleton rows={4} />
      ) : list.length === 0 ? (
        <EmptyState icon={<Users />} title={friends.data?.length ? "No matches" : "No friends yet"} description={friends.data?.length ? undefined : "Add friends to share with them."} />
      ) : (
        <ul className="min-h-0 flex-1 space-y-0.5 overflow-y-auto scrollbar-thin" role="listbox" aria-multiselectable="true" aria-label="Friends">
          {list.map((f) => {
            const on = selected.includes(f.id);
            return (
              <li key={f.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={on}
                  onClick={() => toggle(f.id)}
                  className={cn("flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left hover:bg-surface-2", on && "bg-brand-soft")}
                >
                  <Avatar mediaId={f.avatar_media_id} name={displayName(f)} size="md" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{displayName(f)}</span>
                    <span className="block truncate text-xs text-muted">@{f.username}{f.streak_count > 0 ? ` · 🔥 ${f.streak_count}` : ""}</span>
                  </span>
                  <span className={cn("flex h-6 w-6 items-center justify-center rounded-full border-2", on ? "border-brand bg-brand text-white" : "border-border")}>
                    {on ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
