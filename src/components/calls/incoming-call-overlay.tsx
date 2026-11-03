"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { Phone, PhoneOff, Users, Video } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { useSession } from "@/components/providers/session-provider";
import { useRealtimeEvent } from "@/components/providers/realtime-provider";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { api } from "@/lib/api/client";
import { qk } from "@/lib/query-keys";
import { displayName } from "@/lib/utils";
import { locallyStartedCalls, useCallDetails } from "./call-client";
import { startRingtone } from "./ringtone";

/** How long an unanswered invitation is shown. */
const RING_WINDOW_MS = 45_000;

type IncomingRow = { call_id: string; invited_at: string };

/**
 * Global incoming-call UI mounted by the app shell. Driven by the user's
 * ringing call_participants rows, which the realtime provider keeps fresh
 * (every calls/call_participants change invalidates the ["calls"] cache).
 */
export function IncomingCallOverlay() {
  const { me } = useSession();
  if (!me) return null;
  return (
    <Suspense fallback={null}>
      <IncomingCallWatcher userId={me.user.id} />
    </Suspense>
  );
}

function IncomingCallWatcher({ userId }: { userId: string }) {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());
  const [now, setNow] = useState(() => Date.now());

  const incoming = useQuery({
    queryKey: [...qk.calls, "incoming", userId],
    meta: { silent: true },
    staleTime: 0,
    // Realtime normally delivers invitations instantly; this catches any missed
    // while the subscription was (re)connecting.
    refetchInterval: 15_000,
    queryFn: async () => {
      const since = new Date(Date.now() - RING_WINDOW_MS).toISOString();
      const { data, error } = await getSupabaseBrowserClient()
        .from("call_participants")
        .select("call_id, invited_at, calls!inner(status)")
        .eq("user_id", userId)
        .eq("status", "ringing")
        .gte("invited_at", since)
        .in("calls.status", ["ringing", "active"])
        .order("invited_at", { ascending: false })
        .limit(5);
      if (error) throw error;
      return (data ?? []).map((r) => ({ call_id: r.call_id as string, invited_at: r.invited_at as string })) as IncomingRow[];
    },
  });

  // New invitations arrive as call_participants INSERTs; refetch immediately
  // (the provider's invalidation covers updates such as the call ending).
  useRealtimeEvent("call_participants", (e) => {
    const row = (e.eventType === "DELETE" ? e.old : e.new) as { user_id?: string; status?: string };
    if (row?.user_id === userId) void queryClient.invalidateQueries({ queryKey: [...qk.calls, "incoming", userId] });
  });

  const rows = incoming.data;
  const current = useMemo(
    () =>
      (rows ?? []).find(
        (r) =>
          !dismissed.has(r.call_id) &&
          !locallyStartedCalls.has(r.call_id) &&
          new Date(r.invited_at).getTime() + RING_WINDOW_MS > now &&
          pathname !== `/calls/${r.call_id}`,
      ) ?? null,
    [rows, dismissed, now, pathname],
  );

  // Re-evaluate expiry while something is ringing.
  useEffect(() => {
    if (!rows?.length) return;
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [rows]);

  const dismiss = useCallback((id: string) => {
    setDismissed((prev) => new Set(prev).add(id));
  }, []);

  return (
    <AnimatePresence>
      {current ? <IncomingCallCard key={current.call_id} callId={current.call_id} userId={userId} onDone={() => dismiss(current.call_id)} /> : null}
    </AnimatePresence>
  );
}

function IncomingCallCard({ callId, userId, onDone }: { callId: string; userId: string; onDone: () => void }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const details = useCallDetails(callId);

  const decline = useMutation({
    mutationFn: () => api.post(`/api/calls/${callId}/decline`),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: qk.calls });
    },
  });

  const call = details.data?.call;
  const mine = details.data?.participants.find((p) => p.user_id === userId);
  const stillRinging = Boolean(call && (call.status === "ringing" || call.status === "active") && mine?.status === "ringing");
  const visible = details.isSuccess && stillRinging;

  // The call stopped ringing for us (answered elsewhere, cancelled, ended).
  useEffect(() => {
    if (details.isSuccess && !stillRinging) onDone();
    if (details.isError) onDone();
  }, [details.isSuccess, details.isError, stillRinging, onDone]);

  useRealtimeEvent("calls", (e) => {
    const row = e.new as { id?: string };
    if (row?.id === callId) void details.refetch();
  });
  useRealtimeEvent("call_participants", (e) => {
    const row = e.new as { call_id?: string };
    if (row?.call_id === callId) void details.refetch();
  });

  useEffect(() => {
    if (!visible) return;
    return startRingtone({ vibrate: true, pattern: "incoming" });
  }, [visible]);

  if (!visible || !details.data || !call) return null;

  const { conversation, participants } = details.data;
  const caller = participants.find((p) => p.user_id === call.initiator_id)?.profile ?? null;
  const isGroup = conversation.type === "group";
  const title = isGroup ? conversation.title : displayName(caller);
  const avatarId = isGroup ? conversation.avatar_media_id : caller?.avatar_media_id;
  const KindIcon = call.kind === "video" ? Video : Phone;
  const subtitle = isGroup
    ? `${caller ? `@${caller.username}` : "Someone"} is calling the group`
    : `Incoming ${call.kind === "video" ? "video" : "voice"} call`;

  const accept = () => {
    onDone();
    router.push(`/calls/${callId}?accept=1`);
  };

  return (
    <motion.div
      role="alertdialog"
      aria-modal="false"
      aria-labelledby={`incoming-${callId}-title`}
      aria-describedby={`incoming-${callId}-desc`}
      initial={{ opacity: 0, y: 24, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 24, scale: 0.98 }}
      transition={{ type: "spring", stiffness: 380, damping: 32 }}
      className="fixed inset-0 z-[90] flex flex-col items-center justify-between overflow-hidden bg-[#0d0a1c] px-6 pb-[max(2.5rem,env(safe-area-inset-bottom))] pt-[max(4rem,env(safe-area-inset-top))] text-white sm:inset-auto sm:bottom-6 sm:right-6 sm:w-[380px] sm:flex-row sm:gap-4 sm:rounded-3xl sm:border sm:border-white/10 sm:p-4 sm:shadow-[var(--shadow-pop)]"
    >
      <div aria-hidden className="brand-gradient pointer-events-none absolute inset-0 opacity-25 sm:opacity-30" />
      <div aria-hidden className="pointer-events-none absolute -top-32 left-1/2 h-80 w-80 -translate-x-1/2 rounded-full bg-[#7c5cff] opacity-40 blur-3xl sm:hidden" />

      <div className="relative flex flex-col items-center text-center sm:min-w-0 sm:flex-1 sm:flex-row sm:gap-3 sm:text-left">
        <div className="relative">
          <span aria-hidden className="absolute inset-0 animate-pulse-ring rounded-full bg-white/30" />
          <span aria-hidden className="absolute inset-0 animate-pulse-ring rounded-full bg-white/20 [animation-delay:0.6s]" />
          <Avatar mediaId={avatarId} name={title} size="2xl" className="relative sm:hidden" />
          <Avatar mediaId={avatarId} name={title} size="md" className="relative hidden sm:inline-flex" />
        </div>
        <div className="mt-6 min-w-0 sm:mt-0">
          <p id={`incoming-${callId}-title`} className="truncate font-display text-3xl font-extrabold sm:text-base sm:font-bold">
            {title}
          </p>
          <p id={`incoming-${callId}-desc`} className="mt-2 flex items-center justify-center gap-1.5 text-sm text-white/75 sm:mt-0 sm:justify-start sm:text-xs">
            {isGroup ? <Users className="h-4 w-4 sm:h-3.5 sm:w-3.5" aria-hidden /> : <KindIcon className="h-4 w-4 sm:h-3.5 sm:w-3.5" aria-hidden />}
            <span className="truncate">{subtitle}</span>
          </p>
        </div>
      </div>

      <div className="relative flex w-full max-w-xs items-start justify-around sm:w-auto sm:max-w-none sm:items-center sm:gap-2">
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => {
              decline.mutate();
              onDone();
            }}
            disabled={decline.isPending}
            aria-label="Decline call"
            className="flex h-16 w-16 items-center justify-center rounded-full bg-danger text-white shadow-lg transition-transform hover:brightness-110 active:scale-95 sm:h-11 sm:w-11"
          >
            <PhoneOff className="h-7 w-7 sm:h-5 sm:w-5" aria-hidden />
          </button>
          <span className="text-xs font-semibold text-white/80 sm:sr-only">Decline</span>
        </div>
        <div className="flex flex-col items-center gap-2">
          <motion.button
            type="button"
            onClick={accept}
            aria-label={`Accept ${call.kind} call`}
            animate={{ scale: [1, 1.08, 1] }}
            transition={{ duration: 1.3, repeat: Infinity, ease: "easeInOut" }}
            className="flex h-16 w-16 items-center justify-center rounded-full bg-success text-white shadow-lg hover:brightness-110 sm:h-11 sm:w-11"
          >
            <KindIcon className="h-7 w-7 sm:h-5 sm:w-5" aria-hidden />
          </motion.button>
          <span className="text-xs font-semibold text-white/80 sm:sr-only">Accept</span>
        </div>
      </div>
    </motion.div>
  );
}
