"use client";

import { memo, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Download, ExternalLink, FileText, Loader2, MapPin, Pause, Phone, Play, Radio, Video, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useRealtimeEvent } from "@/components/providers/realtime-provider";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { errorMessage } from "@/lib/api/client";
import { cn, displayName, formatBytes, formatDuration, linkify, mediaUrl } from "@/lib/utils";
import { toast } from "sonner";
import type { UserCard } from "@/types/models";
import type { AttachmentInfo, ChatMessage } from "./types";
import type { OutboxFile } from "./use-chat";
import { Sticker } from "./stickers";
import { liveLocation, useActiveShares } from "./live-location";

export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(t);
  }, [intervalMs]);
  return now;
}

/** Safe text rendering: URLs become links, everything else stays text. */
export function RichText({ text, mine }: { text: string; mine: boolean }) {
  return (
    <p className="whitespace-pre-wrap break-words text-[15px] leading-snug">
      {linkify(text).map((part, i) =>
        part.type === "link" ? (
          <a
            key={i}
            href={part.value}
            target="_blank"
            rel="noopener noreferrer nofollow ugc"
            className={cn("underline underline-offset-2", mine ? "text-white" : "text-brand")}
            onClick={(e) => e.stopPropagation()}
          >
            {part.value}
          </a>
        ) : (
          <span key={i}>{part.value}</span>
        ),
      )}
    </p>
  );
}

function LinkCard({ meta, mine }: { meta: Record<string, unknown>; mine: boolean }) {
  const url = typeof meta.url === "string" ? meta.url : null;
  if (!url || !/^https?:\/\//i.test(url)) return null;
  const title = typeof meta.title === "string" ? meta.title : null;
  const description = typeof meta.description === "string" ? meta.description : null;
  let domain = typeof meta.domain === "string" ? meta.domain : "";
  if (!domain) {
    try {
      domain = new URL(url).hostname.replace(/^www\./, "");
    } catch {
      domain = url;
    }
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer nofollow ugc"
      onClick={(e) => e.stopPropagation()}
      className={cn("mb-1.5 block rounded-xl border-l-4 px-3 py-2", mine ? "border-white/70 bg-white/15" : "border-brand bg-surface-2")}
    >
      <span className={cn("flex items-center gap-1 text-[11px] font-bold uppercase tracking-wide", mine ? "text-white/80" : "text-brand")}>
        <ExternalLink className="h-3 w-3" /> {domain}
      </span>
      {title ? <span className="mt-0.5 line-clamp-2 block text-sm font-bold">{title}</span> : null}
      {description ? <span className={cn("mt-0.5 line-clamp-2 block text-xs", mine ? "text-white/85" : "text-muted")}>{description}</span> : null}
    </a>
  );
}

// ---------------------------------------------------------------------------
// Images + lightbox
// ---------------------------------------------------------------------------
type Visual = { src: string; kind: "image" | "video"; width?: number | null; height?: number | null; downloadHref?: string };

function Lightbox({ items, index, onClose }: { items: Visual[]; index: number; onClose: () => void }) {
  const [i, setI] = useState(index);
  const item = items[i];
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setI((x) => Math.min(items.length - 1, x + 1));
      if (e.key === "ArrowLeft") setI((x) => Math.max(0, x - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items.length]);
  return (
    <Dialog open onClose={onClose} variant="fullscreen" hideClose className="bg-black text-white">
      <div className="relative flex h-full min-h-[70dvh] items-center justify-center">
        <div className="absolute right-0 top-0 z-10 flex gap-2">
          {item?.downloadHref ? (
            <a href={item.downloadHref} className="rounded-full bg-white/10 p-2.5 hover:bg-white/20" aria-label="Download">
              <Download className="h-5 w-5" />
            </a>
          ) : null}
          <button type="button" onClick={onClose} className="rounded-full bg-white/10 p-2.5 hover:bg-white/20" aria-label="Close viewer">
            <X className="h-5 w-5" />
          </button>
        </div>
        {item?.kind === "video" ? (
          <video src={item.src} controls autoPlay playsInline className="max-h-[85dvh] max-w-full rounded-xl" />
        ) : item ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.src} alt="" className="max-h-[85dvh] max-w-full rounded-xl object-contain" />
        ) : null}
        {items.length > 1 ? (
          <>
            <button type="button" disabled={i === 0} onClick={() => setI(i - 1)} className="absolute left-0 rounded-full bg-white/10 p-3 disabled:opacity-30" aria-label="Previous">
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button type="button" disabled={i === items.length - 1} onClick={() => setI(i + 1)} className="absolute right-0 rounded-full bg-white/10 p-3 disabled:opacity-30" aria-label="Next">
              <ChevronRight className="h-6 w-6" />
            </button>
            <p className="absolute bottom-0 text-sm text-white/70">
              {i + 1} / {items.length}
            </p>
          </>
        ) : null}
      </div>
    </Dialog>
  );
}

function Progress({ value }: { value: number }) {
  return (
    <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-xs font-bold text-white">
      <span className="flex flex-col items-center gap-1">
        <Loader2 className="h-6 w-6 animate-spin" />
        {Math.round(value * 100)}%
      </span>
    </span>
  );
}

function MediaGrid({ visuals, uploads }: { visuals: Visual[]; uploads?: number[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const shown = visuals.slice(0, 4);
  const extra = visuals.length - shown.length;
  const single = visuals.length === 1;
  return (
    <>
      <div className={cn("grid gap-1 overflow-hidden rounded-2xl", single ? "grid-cols-1" : "grid-cols-2")}>
        {shown.map((v, idx) => {
          const ratio = single && v.width && v.height ? `${v.width} / ${v.height}` : "1 / 1";
          return (
            <button
              key={idx}
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(idx);
              }}
              className="relative block w-full overflow-hidden bg-surface-3"
              style={{ aspectRatio: ratio, maxHeight: single ? 360 : undefined }}
              aria-label={`Open ${v.kind === "video" ? "video" : "photo"} ${idx + 1}`}
            >
              {v.kind === "video" ? (
                <>
                  <video src={v.src} muted playsInline preload="metadata" className="h-full w-full object-cover" />
                  <span className="absolute inset-0 flex items-center justify-center">
                    <span className="rounded-full bg-black/50 p-3 text-white">
                      <Play className="h-6 w-6" fill="currentColor" />
                    </span>
                  </span>
                </>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={v.src} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
              )}
              {uploads && uploads[idx] !== undefined && uploads[idx] < 1 ? <Progress value={uploads[idx]} /> : null}
              {idx === 3 && extra > 0 ? (
                <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-2xl font-bold text-white">+{extra}</span>
              ) : null}
            </button>
          );
        })}
      </div>
      {open !== null ? <Lightbox items={visuals} index={open} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Voice
// ---------------------------------------------------------------------------
export function VoicePlayer({ src, durationMs, mine }: { src: string; durationMs?: number | null; mine: boolean }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState((durationMs ?? 0) / 1000);
  const pct = duration > 0 ? Math.min(100, (current / duration) * 100) : 0;
  return (
    <div className="flex min-w-52 items-center gap-3 py-1" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => {
          const a = audio.current;
          if (!a) return;
          if (a.paused) void a.play().catch(() => toast.error("Couldn't play this voice message."));
          else a.pause();
        }}
        className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", mine ? "bg-white text-brand" : "bg-brand text-white")}
        aria-label={playing ? "Pause voice message" : "Play voice message"}
      >
        {playing ? <Pause className="h-4 w-4" fill="currentColor" /> : <Play className="ml-0.5 h-4 w-4" fill="currentColor" />}
      </button>
      <div className="min-w-0 flex-1">
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.1}
          value={current}
          onChange={(e) => {
            const a = audio.current;
            if (a) a.currentTime = Number(e.target.value);
          }}
          aria-label="Seek"
          className={cn("h-1.5 w-full cursor-pointer appearance-none rounded-full", mine ? "accent-white" : "accent-[var(--brand)]")}
          style={{ background: `linear-gradient(to right, ${mine ? "#fff" : "var(--brand)"} ${pct}%, ${mine ? "rgba(255,255,255,.35)" : "var(--surface-3)"} ${pct}%)` }}
        />
        <span className={cn("mt-1 block text-[11px] tabular-nums", mine ? "text-white/80" : "text-muted")}>
          {formatDuration(playing || current > 0 ? current : duration)}
        </span>
      </div>
      <audio
        ref={audio}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrent(0);
        }}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          if (Number.isFinite(e.currentTarget.duration)) setDuration(e.currentTarget.duration);
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------
function DocumentCard({ att, mine, progress, localName }: { att?: AttachmentInfo; mine: boolean; progress?: number; localName?: string }) {
  const name = att?.file_name ?? localName ?? "Document";
  const ext = name.includes(".") ? name.split(".").pop()!.toUpperCase().slice(0, 4) : "FILE";
  const inner = (
    <>
      <span className={cn("relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", mine ? "bg-white/20" : "bg-brand-soft text-brand")}>
        {progress !== undefined && progress < 1 ? <Loader2 className="h-5 w-5 animate-spin" /> : <FileText className="h-5 w-5" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{name}</span>
        <span className={cn("block text-xs", mine ? "text-white/80" : "text-muted")}>
          {ext}
          {att?.size_bytes ? ` · ${formatBytes(att.size_bytes)}` : ""}
          {progress !== undefined && progress < 1 ? ` · ${Math.round(progress * 100)}%` : ""}
        </span>
      </span>
      {att ? <Download className="h-4 w-4 shrink-0 opacity-80" /> : null}
    </>
  );
  const cls = cn("flex min-w-56 items-center gap-3 rounded-xl p-2", mine ? "bg-white/10 hover:bg-white/15" : "bg-surface-2 hover:bg-surface-3");
  return att ? (
    <a href={mediaUrl(att.media_id, { download: true })} className={cls} onClick={(e) => e.stopPropagation()} aria-label={`Download ${name}`}>
      {inner}
    </a>
  ) : (
    <div className={cls}>{inner}</div>
  );
}

// ---------------------------------------------------------------------------
// Location
// ---------------------------------------------------------------------------
function MapEmbed({ lat, lng }: { lat: number; lng: number }) {
  const d = 0.006;
  const src = `https://www.openstreetmap.org/export/embed.html?bbox=${lng - d}%2C${lat - d}%2C${lng + d}%2C${lat + d}&layer=mapnik&marker=${lat}%2C${lng}`;
  return (
    <iframe
      title="Map"
      src={src}
      loading="lazy"
      referrerPolicy="no-referrer"
      sandbox="allow-scripts allow-same-origin"
      className="pointer-events-none h-40 w-full border-0"
    />
  );
}

function mapsLink(lat: number, lng: number) {
  return `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`;
}

type ShareRow = { id: string; sharer_id: string; latitude: number; longitude: number; accuracy_m: number | null; expires_at: string; stopped_at: string | null; updated_at: string };

function LiveLocation({ message, mine }: { message: ChatMessage; mine: boolean }) {
  const meta = message.metadata as { share_id?: string; lat?: number; lng?: number; expires_at?: string };
  const shareId = meta.share_id!;
  const qc = useQueryClient();
  const now = useNow(1000);
  const active = useActiveShares();
  const tracking = active.some((s) => s.shareId === shareId);
  const share = useQuery({
    queryKey: ["location-share", shareId],
    queryFn: async () => {
      const { data, error } = await getSupabaseBrowserClient().from("location_shares").select("*").eq("id", shareId).maybeSingle();
      if (error) throw error;
      return (data as ShareRow | null) ?? null;
    },
    refetchInterval: 30_000,
  });
  useRealtimeEvent("location_shares", (e) => {
    const row = e.new as Partial<ShareRow>;
    if (row.id === shareId) qc.setQueryData(["location-share", shareId], row as ShareRow);
  });
  const row = share.data;
  const expiresAt = Date.parse(row?.expires_at ?? meta.expires_at ?? "");
  const live = Boolean(row && !row.stopped_at && expiresAt > now);
  const lat = row?.latitude ?? meta.lat ?? 0;
  const lng = row?.longitude ?? meta.lng ?? 0;
  const left = Math.max(0, Math.floor((expiresAt - now) / 1000));
  const [stopping, setStopping] = useState(false);

  return (
    <div className="w-64 overflow-hidden rounded-xl bg-surface text-ink sm:w-72" onClick={(e) => e.stopPropagation()}>
      <MapEmbed lat={lat} lng={lng} />
      <div className="space-y-2 p-3">
        <p className="flex items-center gap-1.5 text-sm font-bold">
          <Radio className={cn("h-4 w-4", live ? "animate-pulse text-success" : "text-muted")} />
          {live ? "Live location" : "Live location ended"}
        </p>
        {live ? (
          <p className="text-xs text-muted">
            {formatDuration(left)} left
            {row?.updated_at ? ` · updated ${new Date(row.updated_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <a href={mapsLink(lat, lng)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-brand">
            Open in maps <ExternalLink className="h-3 w-3" />
          </a>
        </div>
        {mine && live ? (
          <div className="flex gap-2">
            {!tracking ? (
              <Button size="sm" variant="outline" onClick={() => liveLocation.start(shareId, message.conversation_id, row!.expires_at)}>
                Resume updates
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="danger"
              loading={stopping}
              onClick={async () => {
                setStopping(true);
                try {
                  await liveLocation.stop(shareId);
                  qc.setQueryData(["location-share", shareId], { ...row!, stopped_at: new Date().toISOString() });
                } catch (err) {
                  toast.error(errorMessage(err));
                } finally {
                  setStopping(false);
                }
              }}
            >
              Stop sharing
            </Button>
          </div>
        ) : null}
        {mine && tracking ? (
          <p className="text-[11px] text-muted">{active.find((s) => s.shareId === shareId)?.error ?? "Updating every 10 seconds while Quick Chat is open."}</p>
        ) : null}
      </div>
    </div>
  );
}

function StaticLocation({ lat, lng }: { lat: number; lng: number }) {
  return (
    <div className="w-64 overflow-hidden rounded-xl bg-surface text-ink sm:w-72" onClick={(e) => e.stopPropagation()}>
      <MapEmbed lat={lat} lng={lng} />
      <div className="flex items-center justify-between gap-2 p-3">
        <span className="flex items-center gap-1.5 text-sm font-bold">
          <MapPin className="h-4 w-4 text-accent" /> Location
        </span>
        <a href={mapsLink(lat, lng)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-brand">
          Open in maps <ExternalLink className="h-3 w-3" />
        </a>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main renderer
// ---------------------------------------------------------------------------
export const MessageContent = memo(function MessageContent({
  message,
  mine,
  files,
}: {
  message: ChatMessage;
  mine: boolean;
  /** Local files of an optimistic (outbox) message. */
  files?: OutboxFile[];
}) {
  const meta = message.metadata ?? {};
  const atts = message.attachments;
  switch (message.type) {
    case "image":
    case "gif": {
      const visuals: Visual[] = files?.length
        ? files.map((f) => ({ src: f.previewUrl, kind: "image" }))
        : atts.map((a) => ({ src: mediaUrl(a.media_id)!, kind: "image", width: a.width, height: a.height, downloadHref: mediaUrl(a.media_id, { download: true }) }));
      return (
        <div className="space-y-1.5">
          <MediaGrid visuals={visuals} uploads={files?.map((f) => f.progress)} />
          {message.type === "gif" ? <span className="text-[10px] font-bold uppercase opacity-70">GIF</span> : null}
          {message.body ? <RichText text={message.body} mine={mine} /> : null}
        </div>
      );
    }
    case "video": {
      const visuals: Visual[] = files?.length
        ? files.map((f) => ({ src: f.previewUrl, kind: "video" }))
        : atts.map((a) => ({ src: mediaUrl(a.media_id)!, kind: "video", width: a.width, height: a.height, downloadHref: mediaUrl(a.media_id, { download: true }) }));
      return (
        <div className="space-y-1.5">
          {visuals.length === 1 && !files?.length ? (
            <video src={visuals[0].src} controls playsInline preload="metadata" className="max-h-80 w-full rounded-2xl bg-black" onClick={(e) => e.stopPropagation()} />
          ) : (
            <MediaGrid visuals={visuals} uploads={files?.map((f) => f.progress)} />
          )}
          {message.body ? <RichText text={message.body} mine={mine} /> : null}
        </div>
      );
    }
    case "voice": {
      if (files?.length) {
        const f = files[0];
        return f.progress < 1 && !f.mediaId ? (
          <div className="flex min-w-52 items-center gap-2 py-2 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" /> Uploading voice message… {Math.round(f.progress * 100)}%
          </div>
        ) : (
          <VoicePlayer src={f.previewUrl} durationMs={f.durationMs} mine={mine} />
        );
      }
      return atts[0] ? <VoicePlayer src={mediaUrl(atts[0].media_id)!} durationMs={atts[0].duration_ms} mine={mine} /> : null;
    }
    case "document":
      return (
        <div className="space-y-1.5">
          {files?.length
            ? files.map((f, i) => <DocumentCard key={i} mine={mine} progress={f.progress} localName={f.name} />)
            : atts.map((a) => <DocumentCard key={a.media_id} att={a} mine={mine} />)}
          {message.body ? <RichText text={message.body} mine={mine} /> : null}
        </div>
      );
    case "sticker":
      return <Sticker id={String(meta.sticker_id ?? "")} size={140} />;
    case "location": {
      if (typeof meta.share_id === "string") return <LiveLocation message={message} mine={mine} />;
      const lat = Number(meta.lat);
      const lng = Number(meta.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return <p className="text-sm italic opacity-80">Location unavailable</p>;
      return <StaticLocation lat={lat} lng={lng} />;
    }
    case "contact": {
      const card: UserCard = {
        id: String(meta.user_id ?? ""),
        username: String(meta.username ?? ""),
        display_name: String(meta.display_name ?? ""),
        avatar_media_id: typeof meta.avatar_media_id === "string" ? meta.avatar_media_id : null,
      };
      return (
        <div className="w-60 rounded-xl bg-surface p-3 text-ink" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-3">
            <Avatar mediaId={card.avatar_media_id} name={displayName(card)} size="md" />
            <div className="min-w-0">
              <p className="truncate text-sm font-bold">{displayName(card)}</p>
              {card.username ? <p className="truncate text-xs text-muted">@{card.username}</p> : null}
            </div>
          </div>
          {card.username ? (
            <Link href={`/profile/${card.username}`} className="mt-3 block rounded-xl bg-brand-soft py-2 text-center text-sm font-bold text-brand hover:brightness-95">
              View profile
            </Link>
          ) : null}
        </div>
      );
    }
    case "story_reply": {
      const storyId = typeof meta.story_id === "string" ? meta.story_id : null;
      return (
        <div className="space-y-1.5">
          {storyId ? (
            <Link
              href={`/stories?view=${storyId}`}
              onClick={(e) => e.stopPropagation()}
              className={cn("flex items-center gap-2 rounded-xl border-l-4 px-3 py-2 text-xs font-semibold", mine ? "border-white/70 bg-white/15" : "border-accent bg-surface-2")}
            >
              ↩︎ Replied to {mine ? "their" : "your"} story
            </Link>
          ) : null}
          {message.body ? <RichText text={message.body} mine={mine} /> : null}
        </div>
      );
    }
    case "call": {
      const kind = meta.kind === "video" ? "Video call" : "Voice call";
      const secs = Number(meta.duration_seconds ?? meta.duration_s ?? 0);
      const Icon = meta.kind === "video" ? Video : Phone;
      return (
        <p className="flex items-center gap-2 text-sm font-semibold">
          <Icon className="h-4 w-4" /> {kind}
          {secs > 0 ? <span className="opacity-80">· {formatDuration(secs)}</span> : typeof meta.status === "string" ? <span className="opacity-80">· {meta.status}</span> : null}
        </p>
      );
    }
    case "link":
      return (
        <div>
          <LinkCard meta={meta} mine={mine} />
          {message.body ? <RichText text={message.body} mine={mine} /> : null}
        </div>
      );
    default:
      return message.body ? <RichText text={message.body} mine={mine} /> : null;
  }
});

export function isBubbleless(m: ChatMessage): boolean {
  return m.type === "sticker" || (m.type === "location" && !m.deleted_at) || ((m.type === "image" || m.type === "gif") && !m.body && !m.deleted_at);
}
