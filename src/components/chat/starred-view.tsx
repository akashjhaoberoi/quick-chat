"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Star, StarOff } from "lucide-react";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/ui/feedback";
import { api, errorMessage } from "@/lib/api/client";
import { shortTime } from "@/lib/utils";
import type { StarredItem } from "./types";
import { previewText } from "./use-chat";

/** All messages the user has starred, across conversations. */
export function StarredView() {
  const qc = useQueryClient();
  const starred = useQuery({ queryKey: ["starred"], queryFn: () => api.get<StarredItem[]>("/api/messages/starred") });
  const unstar = useMutation({
    mutationFn: (id: string) => api.post(`/api/messages/${id}/star`, { starred: false }),
    onSuccess: (_d, id) => {
      qc.setQueryData<StarredItem[]>(["starred"], (list) => list?.filter((m) => m.id !== id));
      void qc.invalidateQueries({ queryKey: ["messages"] });
    },
  });
  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex items-center gap-2 border-b border-border bg-surface px-2 py-3 md:px-4">
        <Link href="/chats" className="rounded-full p-2 text-ink-2 hover:bg-surface-2 md:hidden" aria-label="Back to chats">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <Star className="h-5 w-5 text-warning" fill="currentColor" />
        <h1 className="font-display text-lg font-bold">Starred messages</h1>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        {starred.isPending ? (
          <ListSkeleton rows={6} />
        ) : starred.isError ? (
          <ErrorState description={errorMessage(starred.error)} onRetry={() => void starred.refetch()} />
        ) : !starred.data?.length ? (
          <EmptyState icon={<Star />} title="No starred messages" description="Star important messages from the message menu to find them here quickly." />
        ) : (
          <ul className="divide-y divide-border">
            {starred.data.map((m) => (
              <li key={m.id} className="flex items-start gap-3 px-4 py-3 hover:bg-surface-2">
                <Link href={`/chats/${m.conversation_id}?m=${m.id}`} className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 text-xs text-muted">
                    <span className="truncate font-bold text-brand">{m.conversation_title}</span>
                    <span>·</span>
                    <span>{shortTime(m.created_at)}</span>
                  </span>
                  <span className="mt-0.5 line-clamp-3 block whitespace-pre-wrap text-sm">{previewText(m.type, m.body) || "Message"}</span>
                </Link>
                <button
                  type="button"
                  onClick={() => unstar.mutate(m.id)}
                  className="rounded-full p-2 text-muted hover:bg-surface-3 hover:text-ink"
                  aria-label="Unstar message"
                >
                  <StarOff className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
