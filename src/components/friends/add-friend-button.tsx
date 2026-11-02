"use client";

import { useState } from "react";
import { Check, Clock, UserCheck, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ClientApiError } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import {
  useCancelFriendRequest,
  useRelationships,
  useRespondFriendRequest,
  useSendFriendRequest,
  type Relationship,
} from "./hooks";

/**
 * Relationship-aware action: Add → Requested (tap to cancel) → Friends,
 * or Accept when they already asked. State is derived from the live
 * friends/requests caches so every screen stays consistent.
 */
export function AddFriendButton({
  userId,
  hint,
  size = "sm",
  className,
}: {
  userId: string;
  /** Server-provided state used until the caches load (e.g. from search_users). */
  hint?: Relationship;
  size?: "sm" | "md";
  className?: string;
}) {
  const rel = useRelationships().get(userId, hint);
  const send = useSendFriendRequest();
  const respond = useRespondFriendRequest();
  const cancel = useCancelFriendRequest();
  const [unavailable, setUnavailable] = useState<string | null>(null);

  const onError = (error: Error) => {
    if (error instanceof ClientApiError) {
      if (error.code === "requests_disabled") setUnavailable("Not accepting");
      else if (error.code === "user_not_found") setUnavailable("Unavailable");
    }
  };

  if (unavailable) {
    return (
      <Button size={size} variant="secondary" disabled className={className}>
        {unavailable}
      </Button>
    );
  }

  switch (rel.state) {
    case "friends":
      return (
        <span className={cn("inline-flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-xs font-bold text-success", className)}>
          <UserCheck className="h-4 w-4" aria-hidden /> Friends
        </span>
      );
    case "incoming":
      return (
        <Button
          size={size}
          className={className}
          loading={respond.isPending}
          onClick={() => rel.requestId && respond.mutate({ id: rel.requestId, action: "accept" }, { onError })}
        >
          <Check className="h-4 w-4" aria-hidden /> Accept
        </Button>
      );
    case "outgoing":
      return (
        <Button
          size={size}
          variant="secondary"
          className={cn("group", className)}
          loading={cancel.isPending}
          disabled={!rel.requestId}
          onClick={() => rel.requestId && cancel.mutate(rel.requestId)}
          aria-label="Requested — cancel request"
          title="Cancel request"
        >
          <Clock className="h-4 w-4" aria-hidden />
          <span className="group-hover:hidden">Requested</span>
          <span className="hidden group-hover:inline">Cancel</span>
        </Button>
      );
    case "self":
      return null;
    default:
      return (
        <Button size={size} className={className} loading={send.isPending} onClick={() => send.mutate(userId, { onError })}>
          <UserPlus className="h-4 w-4" aria-hidden /> Add
        </Button>
      );
  }
}
