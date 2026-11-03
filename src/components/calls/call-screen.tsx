"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { Track, type LocalVideoTrack, type Participant } from "livekit-client";
import {
  ArrowLeft, Check, Loader2, MessageCircle, Mic, MicOff, MonitorUp, Phone, PhoneOff, RefreshCw, SwitchCamera,
  Video, VideoOff, Volume2, VolumeX, WifiOff,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Menu } from "@/components/ui/controls";
import { ErrorState, SetupNotice, Spinner } from "@/components/ui/feedback";
import { useSession } from "@/components/providers/session-provider";
import { useRealtimeEvent } from "@/components/providers/realtime-provider";
import { useAppConfig } from "@/hooks/use-app-config";
import { api, ClientApiError, errorMessage } from "@/lib/api/client";
import { qk } from "@/lib/query-keys";
import { cn, displayName, formatDuration } from "@/lib/utils";
import type { Call, CallKind } from "@/types/models";
import { beaconLeave, callStatusLabel, startCall, useCallDetails } from "./call-client";
import { acquireCamera, acquireMicrophone, MediaAcquireError, mediaErrorCopy, supportsFacingMode, VIDEO_RESOLUTION } from "./media";
import { ParticipantTile, primaryVideo, QualityBars, VideoView } from "./participant-tile";
import { startRingtone } from "./ringtone";
import { isLiveCall, type CallDetails, type JoinCallResponse } from "./types";
import { useCallRoom } from "./use-call-room";
import { EffectsMenu } from "./effects-menu";
import { useVideoEffects } from "./use-video-effects";

const OUTGOING_TIMEOUT_MS = 45_000;
const REMOTE_GONE_MS = 30_000;

type Phase =
  | { name: "idle" }
  | { name: "preparing" }
  | { name: "media_error"; error: MediaAcquireError }
  | { name: "joining" }
  | { name: "connected" }
  | { name: "lost" }
  | { name: "ending" }
  | { name: "ended"; reason: "left" | "no_answer" | "cancelled" }
  | { name: "failed"; message: string };

export type CallScreenProps = {
  /** Premium entitlement for video effects (see PREMIUM_VIDEO_EFFECTS). Default true: nothing locked. */
  premiumUnlocked?: boolean;
  /** Called when the user taps a locked premium effect. */
  onUpgrade?: () => void;
};

/** Route component for /calls/[id]; keys the session by call id so state never leaks between calls. */
export function CallScreen({ premiumUnlocked = true, onUpgrade }: CallScreenProps = {}) {
  const params = useParams<{ id: string }>();
  const id = params.id;
  return <CallSession key={id} callId={id} premiumUnlocked={premiumUnlocked} onUpgrade={onUpgrade} />;
}

function Shell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("fixed inset-0 z-40 flex flex-col overflow-hidden bg-[#08070f] text-white md:relative md:inset-auto md:z-auto md:h-dvh", className)}>
      <div aria-hidden className="pointer-events-none absolute -left-40 -top-40 h-96 w-96 rounded-full bg-[#7c5cff] opacity-20 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-40 -right-40 h-96 w-96 rounded-full bg-[#ff5e7e] opacity-10 blur-3xl" />
      {children}
    </div>
  );
}

function CallTimer({ startedAt }: { startedAt: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  return <span className="tabular-nums">{formatDuration((now - new Date(startedAt).getTime()) / 1000)}</span>;
}

function ControlButton({
  label, onClick, active = true, danger, children, disabled,
}: { label: string; onClick?: () => void; active?: boolean; danger?: boolean; children: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={danger ? undefined : !active}
      title={label}
      disabled={disabled}
      className={cn(
        "flex h-14 w-14 items-center justify-center rounded-full transition-[transform,background-color] active:scale-95 disabled:opacity-40 [&>svg]:h-6 [&>svg]:w-6",
        danger ? "bg-danger text-white hover:brightness-110" : active ? "bg-white/15 text-white hover:bg-white/25" : "bg-white text-[#14121e] hover:bg-white/90",
      )}
    >
      {children}
    </button>
  );
}

function CallSession({ callId, premiumUnlocked, onUpgrade }: { callId: string; premiumUnlocked: boolean; onUpgrade?: () => void }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const accept = searchParams.get("accept") === "1";
  const queryClient = useQueryClient();
  const { me } = useSession();
  const myId = me?.user.id ?? "";
  const config = useAppConfig();
  const callsEnabled = config.data?.features.calls === true;
  const details = useCallDetails(callId);
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const [preview, setPreview] = useState<LocalVideoTrack | null>(null);
  const [facing, setFacing] = useState<"user" | "environment">("user");
  const joinedRef = useRef(false);
  const mountedRef = useRef(true);
  const hadRemoteRef = useRef(false);
  const previewRef = useRef<LocalVideoTrack | null>(null);
  useEffect(() => {
    previewRef.current = preview;
  });

  const { room, connection, audioBlocked, outputs, cameras, connect, disconnect, bump } = useCallRoom({
    onUnexpectedDisconnect: () => {
      joinedRef.current = false;
      setPhase((p) => (p.name === "connected" || p.name === "joining" ? { name: "lost" } : p));
    },
  });

  // Video effects follow the camera track: the preview track before joining
  // (same object that gets published), then the published camera track.
  const cameraPub = room?.localParticipant.getTrackPublication(Track.Source.Camera);
  const connected = phase.name === "connected";
  const effectsTrack = connected ? ((cameraPub?.track as LocalVideoTrack | undefined) ?? null) : preview;
  const effects = useVideoEffects({
    track: effectsTrack,
    cameraOn: connected ? Boolean(cameraPub?.track && !cameraPub.isMuted) : Boolean(preview),
    premiumUnlocked,
  });
  const prepareEffects = effects.prepare;

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const call = details.data?.call;
  const participants = useMemo(() => details.data?.participants ?? [], [details.data]);
  const mine = participants.find((p) => p.user_id === myId);
  const isInitiator = Boolean(call && call.initiator_id === myId);
  const live = isLiveCall(call?.status);
  const profiles = useMemo(() => new Map(participants.map((p) => [p.user_id, p.profile])), [participants]);

  const setCall = useCallback(
    (next: Call | null) => {
      if (!next) return;
      queryClient.setQueryData<CallDetails>(qk.call(callId), (old) => (old ? { ...old, call: next } : old));
    },
    [queryClient, callId],
  );

  // Realtime: the other side answering, declining or hanging up.
  useRealtimeEvent("calls", (e) => {
    const row = e.new as Partial<Call>;
    if (row?.id === callId && row.status) {
      setCall({ ...(details.data?.call as Call), ...(row as Call) });
      void details.refetch();
    }
  });
  useRealtimeEvent("call_participants", (e) => {
    const row = (e.eventType === "DELETE" ? e.old : e.new) as { call_id?: string };
    if (row?.call_id === callId) void details.refetch();
  });

  const stopPreview = useCallback(() => {
    setPreview((p) => {
      p?.stop();
      return null;
    });
  }, []);

  const begin = useCallback(
    async (kind: CallKind, skipCamera = false) => {
      setPhase({ name: "preparing" });
      let audio;
      let video: LocalVideoTrack | null = null;
      try {
        audio = await acquireMicrophone();
      } catch (error) {
        setPhase({ name: "media_error", error: error as MediaAcquireError });
        return;
      }
      if (kind === "video" && !skipCamera) {
        try {
          video = await acquireCamera("user");
        } catch (error) {
          audio.stop();
          setPhase({ name: "media_error", error: error as MediaAcquireError });
          return;
        }
      }
      if (!mountedRef.current) {
        audio.stop();
        video?.stop();
        return;
      }
      setFacing("user");
      setPreview(video);
      setPhase({ name: "joining" });
      // Apply the saved effect before publishing (bounded wait) so the first
      // frames others see are already processed; runs alongside the join request.
      const effectsReady = video ? prepareEffects(video) : Promise.resolve();
      let res: JoinCallResponse;
      try {
        res = await api.post<JoinCallResponse>(`/api/calls/${callId}/join`);
      } catch (error) {
        audio.stop();
        video?.stop();
        setPreview(null);
        if (error instanceof ClientApiError && error.code === "call_ended") {
          await details.refetch();
          setPhase({ name: "idle" });
        } else {
          setPhase({ name: "failed", message: errorMessage(error) });
        }
        return;
      }
      joinedRef.current = true;
      setCall(res.call);
      if (!mountedRef.current) return;
      await effectsReady;
      try {
        await connect({ url: res.url, token: res.token, audio, video });
        if (mountedRef.current) setPhase({ name: "connected" });
      } catch {
        audio.stop();
        video?.stop();
        if (mountedRef.current) setPhase({ name: "lost" });
      }
      setPreview(null);
    },
    [callId, connect, details, setCall, prepareEffects],
  );

  const hangUp = useCallback(
    async (reason: "left" | "no_answer" | "cancelled" = "left") => {
      setPhase({ name: "ending" });
      joinedRef.current = false;
      stopPreview();
      await disconnect();
      try {
        setCall(await api.post<Call | null>(`/api/calls/${callId}/leave`));
      } catch {
        // The call may already be over; refetch below shows the final state.
      }
      void queryClient.invalidateQueries({ queryKey: qk.calls });
      void details.refetch();
      setPhase({ name: "ended", reason });
    },
    [callId, details, disconnect, queryClient, setCall, stopPreview],
  );

  const decline = useMutation({
    mutationFn: () => api.post<Call | null>(`/api/calls/${callId}/decline`),
    onSuccess: (next) => {
      setCall(next);
      void queryClient.invalidateQueries({ queryKey: qk.calls });
      if (next && isLiveCall(next.status)) router.push("/calls");
    },
  });

  // Auto-join: the initiator, or a callee who tapped Accept (?accept=1).
  const shouldAutoStart = Boolean(call && live && callsEnabled && (accept || mine?.status === "joined"));
  useEffect(() => {
    if (phase.name !== "idle" || !shouldAutoStart || !call) return;
    const kind = call.kind;
    const t = window.setTimeout(() => void begin(kind), 0);
    return () => window.clearTimeout(t);
  }, [phase.name, shouldAutoStart, call, begin]);

  // The call ended remotely (declined, hung up, missed): release devices.
  const terminal = Boolean(call && !live);
  useEffect(() => {
    if (!terminal) return;
    joinedRef.current = false;
    void disconnect();
    previewRef.current?.stop();
  }, [terminal, disconnect]);

  const remotes: Participant[] = room ? Array.from(room.remoteParticipants.values()) : [];
  const remoteCount = remotes.length;
  const inSession = phase.name === "preparing" || phase.name === "joining" || phase.name === "connected";

  useEffect(() => {
    if (remoteCount > 0) hadRemoteRef.current = true;
  }, [remoteCount]);

  // Outgoing call nobody answers within 45 s → stop ringing ("No answer").
  const outgoingRinging = Boolean(isInitiator && call?.status === "ringing" && remoteCount === 0 && inSession);
  useEffect(() => {
    if (!outgoingRinging || !call) return;
    const remaining = new Date(call.created_at).getTime() + OUTGOING_TIMEOUT_MS - Date.now();
    const t = window.setTimeout(() => void hangUp("no_answer"), Math.max(remaining, 1000));
    return () => window.clearTimeout(t);
  }, [outgoingRinging, call, hangUp]);

  useEffect(() => {
    if (!outgoingRinging) return;
    return startRingtone({ pattern: "outgoing" });
  }, [outgoingRinging]);

  // 1:1 call where the other person vanished from the media server (crash, lost network).
  const isDirect = details.data?.conversation.type === "direct";
  const remoteGone = phase.name === "connected" && call?.status === "active" && isDirect && remoteCount === 0;
  useEffect(() => {
    if (!remoteGone || !hadRemoteRef.current) return;
    const t = window.setTimeout(() => void hangUp("left"), REMOTE_GONE_MS);
    return () => window.clearTimeout(t);
  }, [remoteGone, hangUp]);

  // Leave when the tab closes or the user navigates away.
  useEffect(() => {
    const onHide = () => {
      if (joinedRef.current) {
        joinedRef.current = false;
        beaconLeave(callId);
      }
    };
    window.addEventListener("pagehide", onHide);
    window.addEventListener("beforeunload", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      window.removeEventListener("beforeunload", onHide);
      onHide();
    };
  }, [callId]);

  // ----- Controls -----
  const local = room?.localParticipant;
  const micOn = local?.isMicrophoneEnabled ?? true;
  const camOn = local?.isCameraEnabled ?? false;
  const sharing = local?.isScreenShareEnabled ?? false;
  const canShareScreen =
    typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getDisplayMedia) && navigator.maxTouchPoints === 0;
  const activeOutput = room?.getActiveDevice("audiooutput") ?? "default";

  const run = (fn: () => Promise<unknown>, failure: string) => {
    fn()
      .then(() => bump())
      .catch((error: unknown) => {
        if ((error as { name?: string })?.name === "NotAllowedError" && failure.includes("screen")) return;
        toast.error(error instanceof MediaAcquireError ? mediaErrorCopy(error).title : failure);
        bump();
      });
  };

  const toggleMic = () => local && run(() => local.setMicrophoneEnabled(!micOn), "Couldn't change your microphone.");
  const toggleCam = () =>
    local && run(() => local.setCameraEnabled(!camOn, { facingMode: facing, resolution: VIDEO_RESOLUTION }), "Couldn't turn on your camera. Check permissions.");
  const toggleShare = () => local && run(() => local.setScreenShareEnabled(!sharing, { audio: false }), "Couldn't share your screen.");
  const flipCamera = () => {
    if (!room || !local) return;
    const track = local.getTrackPublication(Track.Source.Camera)?.track as LocalVideoTrack | undefined;
    if (!track) return;
    if (supportsFacingMode()) {
      const next = facing === "user" ? "environment" : "user";
      run(async () => {
        // LiveKit restarts an attached effect processor with the new camera;
        // resync covers the case where it was dropped along the way.
        await track.restartTrack({ facingMode: next, resolution: VIDEO_RESOLUTION });
        setFacing(next);
        effects.resync();
      }, "Couldn't switch camera.");
    } else {
      const current = room.getActiveDevice("videoinput");
      const idx = cameras.findIndex((c) => c.deviceId === current);
      const next = cameras[(idx + 1) % cameras.length];
      if (next)
        run(async () => {
          await room.switchActiveDevice("videoinput", next.deviceId);
          effects.resync();
        }, "Couldn't switch camera.");
    }
  };

  // ----- Rendering -----
  if (details.isPending || config.isPending) {
    return (
      <Shell className="items-center justify-center">
        <Spinner label="Loading call" />
      </Shell>
    );
  }
  if (details.isError || !details.data || !call) {
    const notFound = details.error instanceof ClientApiError && details.error.status === 404;
    return (
      <Shell className="items-center justify-center p-6">
        <div className="rounded-3xl bg-surface p-2 text-ink">
          <ErrorState
            title={notFound ? "Call not found" : "Couldn't load this call"}
            description={notFound ? "This call doesn't exist or you weren't part of it." : errorMessage(details.error)}
            onRetry={notFound ? undefined : () => void details.refetch()}
          />
          <div className="flex justify-center pb-4">
            <Link href="/calls" className="text-sm font-semibold text-brand hover:underline">
              Go to call history
            </Link>
          </div>
        </div>
      </Shell>
    );
  }

  const { conversation } = details.data;
  const others = participants.filter((p) => p.user_id !== myId);
  const caller = participants.find((p) => p.user_id === call.initiator_id)?.profile ?? null;
  const headerTitle = conversation.title;
  const KindIcon = call.kind === "video" ? Video : Phone;

  if (terminal || phase.name === "ended") {
    return (
      <EndedView
        call={call}
        title={headerTitle}
        avatarId={conversation.avatar_media_id}
        reason={phase.name === "ended" ? phase.reason : null}
        isInitiator={isInitiator}
        callsEnabled={callsEnabled}
        onRejoin={() => begin(call.kind)}
      />
    );
  }

  if (!callsEnabled) {
    return (
      <Shell className="items-center justify-center p-6">
        <div className="w-full max-w-md space-y-4 rounded-3xl bg-surface p-5 text-ink">
          <SetupNotice feature="Audio & video calls">
            This server has no calling backend (LiveKit) configured, so calls can&apos;t connect. An administrator needs to add the LiveKit credentials — see docs/SETUP.md.
          </SetupNotice>
          <div className="flex flex-wrap justify-end gap-2">
            {mine?.status === "ringing" ? (
              <Button variant="danger" loading={decline.isPending} onClick={() => decline.mutate()}>
                Decline call
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => router.push(`/chats/${conversation.id}`)}>
              Back to chat
            </Button>
          </div>
        </div>
      </Shell>
    );
  }

  // Lobby: an incoming call opened from a notification, or a live call we can (re)join.
  if (phase.name === "idle" && !shouldAutoStart) {
    const ringingMe = mine?.status === "ringing";
    return (
      <Shell>
        <TopBar title="" onBack={() => router.push("/calls")} />
        <div className="relative flex flex-1 flex-col items-center justify-center px-6 text-center">
          <div className="relative">
            {ringingMe ? <span aria-hidden className="absolute inset-0 animate-pulse-ring rounded-full bg-white/25" /> : null}
            <Avatar mediaId={conversation.avatar_media_id} name={headerTitle} size="2xl" className="relative" />
          </div>
          <h1 className="mt-6 font-display text-3xl font-extrabold">{headerTitle}</h1>
          <p className="mt-2 flex items-center gap-1.5 text-sm text-white/70">
            <KindIcon className="h-4 w-4" aria-hidden />
            {ringingMe
              ? conversation.type === "group"
                ? `${caller ? `@${caller.username}` : "Someone"} is calling the group`
                : `Incoming ${call.kind === "video" ? "video" : "voice"} call`
              : `${call.kind === "video" ? "Video" : "Voice"} call in progress`}
          </p>
        </div>
        <div className="relative flex items-start justify-center gap-14 pb-[max(3rem,env(safe-area-inset-bottom))]">
          {ringingMe ? (
            <div className="flex flex-col items-center gap-2">
              <ControlButton label="Decline call" danger onClick={() => decline.mutate()} disabled={decline.isPending}>
                <PhoneOff />
              </ControlButton>
              <span className="text-xs font-semibold text-white/70">Decline</span>
            </div>
          ) : null}
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={() => void begin(call.kind)}
              aria-label={ringingMe ? "Accept call" : "Join call"}
              className="flex h-14 w-14 items-center justify-center rounded-full bg-success text-white transition-transform hover:brightness-110 active:scale-95"
            >
              <KindIcon className="h-6 w-6" />
            </button>
            <span className="text-xs font-semibold text-white/70">{ringingMe ? "Accept" : "Join"}</span>
          </div>
        </div>
      </Shell>
    );
  }

  if (phase.name === "media_error") {
    const copy = mediaErrorCopy(phase.error);
    const cameraIssue = phase.error.device === "camera";
    return (
      <Shell className="items-center justify-center p-6">
        <div role="alert" className="w-full max-w-md rounded-3xl bg-surface p-6 text-ink shadow-[var(--shadow-pop)]">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-3xl bg-danger-soft text-danger">
            {cameraIssue ? <VideoOff className="h-7 w-7" /> : <MicOff className="h-7 w-7" />}
          </div>
          <h1 className="font-display text-xl font-bold">{copy.title}</h1>
          <p className="mt-2 text-sm text-muted">{copy.body}</p>
          <div className="mt-6 flex flex-wrap justify-end gap-2">
            <Button variant="ghost" onClick={() => void hangUp(isInitiator ? "cancelled" : "left")}>
              {isInitiator && call.status === "ringing" ? "Cancel call" : "Leave"}
            </Button>
            {cameraIssue ? (
              <Button variant="outline" onClick={() => void begin(call.kind, true)}>
                Continue without camera
              </Button>
            ) : null}
            <Button onClick={() => void begin(call.kind)}>
              <RefreshCw className="h-4 w-4" aria-hidden /> Try again
            </Button>
          </div>
        </div>
      </Shell>
    );
  }

  if (phase.name === "failed" || phase.name === "lost") {
    return (
      <Shell className="items-center justify-center p-6">
        <div role="alert" className="w-full max-w-md rounded-3xl bg-surface p-6 text-center text-ink shadow-[var(--shadow-pop)]">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-3xl bg-danger-soft text-danger">
            <WifiOff className="h-7 w-7" />
          </div>
          <h1 className="font-display text-xl font-bold">{phase.name === "lost" ? "Connection lost" : "Couldn't join the call"}</h1>
          <p className="mt-2 text-sm text-muted">
            {phase.name === "lost" ? "We lost the connection to the call server. Check your internet connection and rejoin." : phase.message}
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <Button variant="ghost" onClick={() => void hangUp("left")}>
              Leave call
            </Button>
            <Button onClick={() => void begin(call.kind)}>Rejoin</Button>
          </div>
        </div>
      </Shell>
    );
  }

  // ----- Live session (preparing → joining → connected) -----
  const showCalling = isInitiator && call.status === "ringing" && remoteCount === 0;
  const waiting = !showCalling && remoteCount === 0;
  const ringingOthers = others.filter((p) => p.status === "ringing" || p.status === "joined");
  const localTile = local ? <ParticipantTile participant={local} profile={profiles.get(myId) ?? null} mirror={facing === "user"} /> : null;
  const anyVideo = room ? [local as Participant, ...remotes].some((p) => p && primaryVideo(p)) : false;

  let stage: ReactNode;
  if (phase.name !== "connected" || !room || !local) {
    stage = preview ? (
      <div className="absolute inset-0">
        <VideoView track={preview} mirror />
      </div>
    ) : null;
  } else if (remoteCount === 0) {
    stage = local && primaryVideo(local) ? <div className="absolute inset-0">{localTile}</div> : null;
  } else if (remoteCount === 1 && (call.kind === "video" || anyVideo)) {
    const remote = remotes[0];
    stage = (
      <div className="absolute inset-0">
        <ParticipantTile participant={remote} profile={profiles.get(remote.identity) ?? null} className="h-full w-full rounded-none ring-0" />
        <PiP>{localTile}</PiP>
      </div>
    );
  } else if (remoteCount === 1) {
    const remote = remotes[0];
    const profile = profiles.get(remote.identity) ?? null;
    stage = (
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="relative">
          <AnimatePresence>
            {remote.isSpeaking ? (
              <motion.span
                aria-hidden
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1.12 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="absolute inset-0 rounded-full bg-success/30"
              />
            ) : null}
          </AnimatePresence>
          <Avatar mediaId={profile?.avatar_media_id} name={displayName(profile)} size="2xl" className="relative" />
        </div>
        <p className="mt-5 font-display text-2xl font-bold">{profile ? displayName(profile) : remote.name}</p>
        <p className="mt-1 flex items-center gap-2 text-sm text-white/70">
          {!remote.isMicrophoneEnabled ? (
            <>
              <MicOff className="h-4 w-4 text-danger" aria-hidden /> Muted
            </>
          ) : (
            <QualityBars quality={remote.connectionQuality} />
          )}
        </p>
      </div>
    );
  } else {
    const all = [local as Participant, ...remotes];
    const cols = all.length <= 2 ? "grid-cols-1 sm:grid-cols-2" : all.length <= 4 ? "grid-cols-2" : "grid-cols-2 lg:grid-cols-3";
    stage = (
      <div className={cn("absolute inset-0 grid auto-rows-fr gap-2 overflow-y-auto p-2 pb-28 pt-20", cols)}>
        {all.map((p) => (
          <ParticipantTile
            key={p.identity}
            participant={p}
            profile={profiles.get(p.identity) ?? null}
            mirror={p.isLocal && facing === "user"}
            compact={all.length > 4}
            className="min-h-40"
          />
        ))}
      </div>
    );
  }

  return (
    <Shell>
      <div className="relative min-h-0 flex-1">
        {stage}

        <div className="absolute inset-x-0 top-0 z-10 bg-gradient-to-b from-black/60 to-transparent px-4 pb-8 pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-display text-lg font-bold">{headerTitle}</p>
              <p className="text-xs text-white/75">
                {call.started_at && remoteCount > 0 ? (
                  <CallTimer startedAt={call.started_at} />
                ) : phase.name === "preparing" ? (
                  "Starting your devices…"
                ) : phase.name === "joining" ? (
                  "Connecting…"
                ) : showCalling ? (
                  "Ringing…"
                ) : (
                  "Waiting for others to join…"
                )}
              </p>
            </div>
            {local ? <QualityBars quality={local.connectionQuality} /> : null}
          </div>
          <AnimatePresence>
            {connection === "reconnecting" ? (
              <motion.div
                role="status"
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="mx-auto mt-3 flex w-fit items-center gap-2 rounded-full bg-warning px-3 py-1.5 text-xs font-bold text-black"
              >
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> Reconnecting…
              </motion.div>
            ) : null}
            {audioBlocked ? (
              <motion.button
                type="button"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => void room?.startAudio().then(bump)}
                className="mx-auto mt-3 flex w-fit items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-bold text-[#14121e]"
              >
                <VolumeX className="h-3.5 w-3.5" aria-hidden /> Tap to turn on sound
              </motion.button>
            ) : null}
          </AnimatePresence>
        </div>

        {showCalling || waiting || phase.name !== "connected" ? (
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
            <div className="flex -space-x-4">
              {(ringingOthers.length ? ringingOthers : others).slice(0, 4).map((p) => (
                <span key={p.user_id} className="relative rounded-full ring-4 ring-[#08070f]">
                  {showCalling ? <span aria-hidden className="absolute inset-0 animate-pulse-ring rounded-full bg-white/25" /> : null}
                  <Avatar mediaId={p.profile?.avatar_media_id} name={displayName(p.profile)} size={others.length > 1 ? "xl" : "2xl"} className="relative" />
                </span>
              ))}
            </div>
            <p className="mt-6 font-display text-2xl font-bold drop-shadow">{headerTitle}</p>
            <p className="mt-1 flex items-center gap-2 text-sm text-white/80 drop-shadow" role="status">
              {phase.name === "connected" ? null : <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
              {showCalling ? "Calling…" : phase.name === "preparing" ? "Starting your devices…" : "Connecting…"}
            </p>
          </div>
        ) : null}
      </div>

      <div className="relative z-10 flex flex-wrap items-center justify-center gap-3 bg-gradient-to-t from-black/70 to-transparent px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-6">
        <ControlButton label={micOn ? "Mute microphone" : "Unmute microphone"} active={micOn} onClick={toggleMic} disabled={!local}>
          {micOn ? <Mic /> : <MicOff />}
        </ControlButton>
        {call.kind === "video" ? (
          <ControlButton label={camOn ? "Turn camera off" : "Turn camera on"} active={camOn} onClick={toggleCam} disabled={!local}>
            {camOn ? <Video /> : <VideoOff />}
          </ControlButton>
        ) : null}
        {call.kind === "video" && camOn && cameras.length > 1 ? (
          <ControlButton label="Switch camera" onClick={flipCamera}>
            <SwitchCamera />
          </ControlButton>
        ) : null}
        {call.kind === "video" && local ? (
          <EffectsMenu
            selection={effects.selection}
            support={effects.support}
            status={effects.status}
            cameraOn={camOn}
            onChoose={effects.choose}
            premiumUnlocked={premiumUnlocked}
            onUpgrade={onUpgrade}
          />
        ) : null}
        {canShareScreen && local ? (
          <ControlButton label={sharing ? "Stop sharing screen" : "Share screen"} active={!sharing} onClick={toggleShare}>
            <MonitorUp />
          </ControlButton>
        ) : null}
        {outputs.length > 1 && room ? (
          <Menu
            label="Choose audio output"
            align="start"
            trigger={
              <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25">
                <Volume2 className="h-6 w-6" aria-hidden />
              </span>
            }
            items={outputs.map((d, i) => ({
              label: d.label || `Speaker ${i + 1}`,
              icon: d.deviceId === activeOutput ? <Check /> : <span className="inline-block h-4 w-4" />,
              onSelect: () => run(() => room.switchActiveDevice("audiooutput", d.deviceId), "Couldn't switch speaker."),
            }))}
          />
        ) : null}
        <ControlButton
          label={showCalling ? "Cancel call" : "Leave call"}
          danger
          onClick={() => void hangUp(showCalling ? "cancelled" : "left")}
          disabled={phase.name === "ending"}
        >
          <PhoneOff />
        </ControlButton>
      </div>
    </Shell>
  );
}

function PiP({ children }: { children: ReactNode }) {
  const bounds = useRef<HTMLDivElement>(null);
  if (!children) return null;
  return (
    <div ref={bounds} className="pointer-events-none absolute inset-3 top-20 bottom-28">
      <motion.div
        drag
        dragConstraints={bounds}
        dragMomentum={false}
        className="pointer-events-auto absolute right-0 top-0 aspect-[3/4] w-28 cursor-grab overflow-hidden rounded-2xl shadow-[var(--shadow-pop)] active:cursor-grabbing sm:w-40"
        aria-label="Your video (drag to move)"
      >
        <div className="h-full w-full [&>div]:h-full [&>div]:rounded-2xl">{children}</div>
      </motion.div>
    </div>
  );
}

function TopBar({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="relative flex items-center gap-2 px-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
      <button type="button" onClick={onBack} aria-label="Back to calls" className="rounded-full p-2.5 text-white/80 hover:bg-white/10">
        <ArrowLeft className="h-5 w-5" />
      </button>
      <span className="truncate font-semibold">{title}</span>
    </div>
  );
}

function EndedView({
  call, title, avatarId, reason, isInitiator, callsEnabled, onRejoin,
}: {
  call: Call;
  title: string;
  avatarId: string | null;
  reason: "left" | "no_answer" | "cancelled" | null;
  isInitiator: boolean;
  callsEnabled: boolean;
  onRejoin: () => void;
}) {
  const router = useRouter();
  const again = useMutation({
    mutationFn: (kind: CallKind) => startCall(call.conversation_id, kind),
    onSuccess: (next) => router.replace(`/calls/${next.id}`),
  });
  const stillLive = isLiveCall(call.status);
  const label = stillLive
    ? "You left the call"
    : reason === "no_answer"
      ? "No answer"
      : callStatusLabel(call.status, { outgoing: isInitiator });
  const duration =
    call.started_at && call.ended_at ? formatDuration((new Date(call.ended_at).getTime() - new Date(call.started_at).getTime()) / 1000) : null;
  const KindIcon = call.kind === "video" ? Video : Phone;

  return (
    <Shell>
      <TopBar title="" onBack={() => router.push("/calls")} />
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative flex flex-1 flex-col items-center justify-center px-6 text-center"
      >
        <Avatar mediaId={avatarId} name={title} size="2xl" />
        <h1 className="mt-6 font-display text-2xl font-extrabold">{title}</h1>
        <p className="mt-2 text-base font-semibold text-white/85" role="status">
          {label}
        </p>
        {duration ? <p className="mt-1 text-sm tabular-nums text-white/60">Duration {duration}</p> : null}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link
            href={`/chats/${call.conversation_id}`}
            className="inline-flex h-12 items-center gap-2 rounded-2xl bg-white/15 px-5 font-semibold hover:bg-white/25"
          >
            <MessageCircle className="h-5 w-5" aria-hidden /> Back to chat
          </Link>
          {stillLive ? (
            <button
              type="button"
              onClick={onRejoin}
              disabled={!callsEnabled}
              className="inline-flex h-12 items-center gap-2 rounded-2xl bg-success px-5 font-semibold text-white hover:brightness-110 disabled:opacity-40"
            >
              <KindIcon className="h-5 w-5" aria-hidden /> Rejoin
            </button>
          ) : (
            <button
              type="button"
              onClick={() => again.mutate(call.kind)}
              disabled={!callsEnabled || again.isPending}
              title={callsEnabled ? undefined : "Calls aren't configured on this server"}
              className="inline-flex h-12 items-center gap-2 rounded-2xl bg-white px-5 font-semibold text-[#14121e] hover:bg-white/90 disabled:opacity-40"
            >
              {again.isPending ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden /> : <KindIcon className="h-5 w-5" aria-hidden />} Call again
            </button>
          )}
        </div>
        <Link href="/calls" className="mt-6 text-sm font-semibold text-white/70 hover:text-white">
          View call history
        </Link>
      </motion.div>
    </Shell>
  );
}

