"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Loader2, Phone, Video } from "lucide-react";
import { useAppConfig } from "@/hooks/use-app-config";
import { useSession } from "@/components/providers/session-provider";
import { cn } from "@/lib/utils";
import type { CallKind } from "@/types/models";
import { startCall } from "./call-client";

/**
 * Audio + video call buttons for a conversation (used in the chat header and
 * call history). Disabled with an explanation when LiveKit isn't configured.
 */
export function CallButtons({ conversationId, compact }: { conversationId: string; compact?: boolean }) {
  const router = useRouter();
  const config = useAppConfig();
  const { me } = useSession();
  const configured = config.data?.features.calls === true;
  const mutation = useMutation({
    mutationFn: (kind: CallKind) => startCall(conversationId, kind),
    onSuccess: (call) => {
      // If someone else's call was already ringing here, we join it right away.
      const joiningExisting = me && call.initiator_id !== me.user.id;
      router.push(`/calls/${call.id}${joiningExisting ? "?accept=1" : ""}`);
    },
  });

  const disabledReason = config.isPending
    ? "Checking call availability…"
    : !configured
      ? "Audio & video calls aren't configured on this server"
      : null;

  const items: { kind: CallKind; label: string; Icon: typeof Phone }[] = [
    { kind: "audio", label: "Voice call", Icon: Phone },
    { kind: "video", label: "Video call", Icon: Video },
  ];

  return (
    <div className={cn("flex items-center", compact ? "gap-0.5" : "gap-1")}>
      {items.map(({ kind, label, Icon }) => {
        const busy = mutation.isPending && mutation.variables === kind;
        const disabled = Boolean(disabledReason) || mutation.isPending;
        return (
          <span key={kind} title={disabledReason ?? label} className="inline-flex">
            <button
              type="button"
              aria-label={disabledReason ? `${label} (unavailable: ${disabledReason})` : label}
              aria-disabled={disabled || undefined}
              disabled={disabled}
              onClick={() => mutation.mutate(kind)}
              className={cn(
                "inline-flex items-center justify-center rounded-full text-ink-2 transition-colors hover:bg-surface-2 hover:text-brand disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-ink-2",
                compact ? "h-9 w-9" : "h-10 w-10",
              )}
            >
              {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <Icon className={compact ? "h-[18px] w-[18px]" : "h-5 w-5"} aria-hidden />}
            </button>
          </span>
        );
      })}
    </div>
  );
}
