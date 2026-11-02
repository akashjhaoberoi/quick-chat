"use client";

import { useEffect, useRef } from "react";
import { ConnectionQuality, Track, type Participant, type VideoTrack } from "livekit-client";
import { MicOff, MonitorUp } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { cn, displayName } from "@/lib/utils";
import type { UserCard } from "@/types/models";

export function VideoView({ track, mirror, fit = "cover", className }: { track: VideoTrack; mirror?: boolean; fit?: "cover" | "contain"; className?: string }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    track.attach(el);
    return () => {
      track.detach(el);
    };
  }, [track]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted
      className={cn("h-full w-full bg-black", fit === "cover" ? "object-cover" : "object-contain", mirror && "-scale-x-100", className)}
    />
  );
}

export function QualityBars({ quality, className }: { quality: ConnectionQuality; className?: string }) {
  const level = quality === ConnectionQuality.Excellent ? 3 : quality === ConnectionQuality.Good ? 2 : quality === ConnectionQuality.Poor ? 1 : 0;
  const label =
    quality === ConnectionQuality.Unknown ? "Connection quality unknown" : quality === ConnectionQuality.Lost ? "Connection lost" : `Connection ${quality}`;
  return (
    <span role="img" aria-label={label} title={label} className={cn("inline-flex items-end gap-[2px]", className)}>
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className={cn(
            "w-[3px] rounded-sm",
            i === 1 ? "h-1.5" : i === 2 ? "h-2.5" : "h-3.5",
            i <= level ? (level === 1 ? "bg-warning" : "bg-success") : "bg-white/30",
          )}
        />
      ))}
    </span>
  );
}

/** The video track to show for a participant: screen share first, then camera. */
export function primaryVideo(p: Participant): { track: VideoTrack; screen: boolean } | null {
  for (const source of [Track.Source.ScreenShare, Track.Source.Camera]) {
    const pub = p.getTrackPublication(source);
    if (pub && pub.track && !pub.isMuted && (p.isLocal || pub.isSubscribed)) {
      return { track: pub.track as VideoTrack, screen: source === Track.Source.ScreenShare };
    }
  }
  return null;
}

export function ParticipantTile({
  participant,
  profile,
  mirror,
  className,
  compact,
}: {
  participant: Participant;
  profile: UserCard | null;
  mirror?: boolean;
  className?: string;
  compact?: boolean;
}) {
  const video = primaryVideo(participant);
  const name = participant.isLocal ? "You" : profile ? displayName(profile) : participant.name || "Participant";
  const speaking = participant.isSpeaking;
  const muted = !participant.isMicrophoneEnabled;
  return (
    <div
      className={cn(
        "relative flex items-center justify-center overflow-hidden rounded-3xl bg-[#1a1730] ring-2 ring-transparent transition-shadow duration-200",
        speaking && "ring-success shadow-[0_0_0_4px_rgba(18,183,106,0.25)]",
        className,
      )}
    >
      {video ? (
        <VideoView track={video.track} mirror={mirror && !video.screen} fit={video.screen ? "contain" : "cover"} />
      ) : (
        <div className="flex flex-col items-center gap-3">
          <span className={cn("rounded-full p-1 transition-colors", speaking ? "bg-success/40" : "bg-transparent")}>
            <Avatar mediaId={profile?.avatar_media_id} name={profile ? displayName(profile) : name} size={compact ? "md" : "xl"} />
          </span>
        </div>
      )}
      <div className="absolute inset-x-2 bottom-2 flex items-center gap-1.5">
        <span className="flex min-w-0 items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur">
          {video?.screen ? <MonitorUp className="h-3.5 w-3.5 shrink-0" aria-label="Sharing screen" /> : null}
          {muted ? <MicOff className="h-3.5 w-3.5 shrink-0 text-danger" aria-label="Microphone muted" /> : null}
          <span className="truncate">{name}</span>
        </span>
        {!participant.isLocal ? (
          <span className="rounded-full bg-black/55 px-1.5 py-1 backdrop-blur">
            <QualityBars quality={participant.connectionQuality} />
          </span>
        ) : null}
      </div>
    </div>
  );
}
