"use client";

import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence } from "motion/react";
import { Check, Inbox, Send, X } from "lucide-react";
import { useRealtimeEvent } from "@/components/providers/realtime-provider";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/ui/feedback";
import { errorMessage } from "@/lib/api/client";
import { qk } from "@/lib/query-keys";
import { relativeTime } from "@/lib/utils";
import { useCancelFriendRequest, useFriendRequests, useRespondFriendRequest } from "./hooks";
import { UserRow } from "./user-row";
import type { FriendRequestItem } from "./types";

function mutualLabel(n: number) {
  return n > 0 ? `${n} mutual ${n === 1 ? "friend" : "friends"}` : null;
}

function Subtitle({ r }: { r: FriendRequestItem }) {
  const mutual = mutualLabel(r.mutual_count);
  return (
    <>
      @{r.username}
      {mutual ? <span className="ml-1.5 font-medium text-ink-2">· {mutual}</span> : null}
      <span className="ml-1.5">· {relativeTime(r.created_at)}</span>
    </>
  );
}

/** Friends > Requests tab: incoming (accept/decline) and outgoing (cancel), live-updating. */
export function RequestsTab({ onAddFriends }: { onAddFriends: () => void }) {
  const queryClient = useQueryClient();
  const requests = useFriendRequests();
  const respond = useRespondFriendRequest();
  const cancel = useCancelFriendRequest();

  useRealtimeEvent("friend_requests", () => {
    void queryClient.invalidateQueries({ queryKey: qk.friendRequests });
    void queryClient.invalidateQueries({ queryKey: qk.suggestions });
  });

  if (requests.isPending) return <ListSkeleton rows={5} />;
  if (requests.isError) return <ErrorState description={errorMessage(requests.error)} onRetry={() => void requests.refetch()} />;

  const { incoming, outgoing } = requests.data;
  if (incoming.length === 0 && outgoing.length === 0) {
    return (
      <EmptyState
        icon={<Inbox />}
        title="No pending requests"
        description="When someone adds you, you'll see it here. Requests you send show up here too."
        action={<Button onClick={onAddFriends}>Find friends</Button>}
      />
    );
  }

  const busy = (id: string) =>
    (respond.isPending && respond.variables?.id === id) || (cancel.isPending && cancel.variables === id);

  return (
    <div className="space-y-6">
      <section aria-labelledby="incoming-heading">
        <h2 id="incoming-heading" className="mb-2 px-1 text-xs font-bold uppercase tracking-wider text-muted">
          Received · {incoming.length}
        </h2>
        {incoming.length === 0 ? (
          <p className="rounded-2xl bg-surface-2 px-4 py-3 text-sm text-muted">No new requests.</p>
        ) : (
          <ul className="space-y-0.5">
            <AnimatePresence initial={false}>
              {incoming.map((r, i) => (
                <UserRow
                  key={r.id}
                  index={i}
                  user={{ id: r.user_id, username: r.username, display_name: r.display_name, avatar_media_id: r.avatar_media_id, is_verified: r.is_verified }}
                  subtitle={<Subtitle r={r} />}
                  actions={
                    <>
                      <Button
                        size="sm"
                        disabled={busy(r.id)}
                        loading={respond.isPending && respond.variables?.id === r.id && respond.variables.action === "accept"}
                        onClick={() => respond.mutate({ id: r.id, action: "accept" })}
                      >
                        <Check className="h-4 w-4" aria-hidden /> Accept
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="secondary"
                        aria-label={`Decline request from ${r.display_name || r.username}`}
                        disabled={busy(r.id)}
                        onClick={() => respond.mutate({ id: r.id, action: "reject" })}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </>
                  }
                />
              ))}
            </AnimatePresence>
          </ul>
        )}
      </section>

      {outgoing.length ? (
        <section aria-labelledby="outgoing-heading">
          <h2 id="outgoing-heading" className="mb-2 flex items-center gap-1.5 px-1 text-xs font-bold uppercase tracking-wider text-muted">
            <Send className="h-3.5 w-3.5" aria-hidden /> Sent · {outgoing.length}
          </h2>
          <ul className="space-y-0.5">
            <AnimatePresence initial={false}>
              {outgoing.map((r, i) => (
                <UserRow
                  key={r.id}
                  index={i}
                  user={{ id: r.user_id, username: r.username, display_name: r.display_name, avatar_media_id: r.avatar_media_id, is_verified: r.is_verified }}
                  subtitle={<Subtitle r={r} />}
                  actions={
                    <Button size="sm" variant="secondary" loading={busy(r.id)} onClick={() => cancel.mutate(r.id)}>
                      Cancel
                    </Button>
                  }
                />
              ))}
            </AnimatePresence>
          </ul>
        </section>
      ) : null}
    </div>
  );
}
