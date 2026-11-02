"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "motion/react";
import { toast } from "sonner";
import { AlertTriangle, Info, Loader2, Volume2, VolumeX, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { FitFrame } from "@/components/camera/fit-frame";
import { OverlayLayer } from "@/components/camera/overlay-layer";
import { api } from "@/lib/api/client";
import { mediaUrl } from "@/lib/utils";
import type { UserCard } from "@/types/models";
import type { OpenedSnap } from "./data";

const RING = 2 * Math.PI * 16;

/** Common OS screenshot shortcuts. Best-effort: most OS shortcuts never reach the page. */
function isScreenshotShortcut(e: KeyboardEvent) {
  if (e.key === "PrintScreen" || e.code === "PrintScreen") return true;
  if (e.metaKey && e.shiftKey && ["Digit3", "Digit4", "Digit5", "KeyS"].includes(e.code)) return true;
  return false;
}

/**
 * Full-screen, auto-closing snap viewer. Media is requested only after the
 * server opened a view window; nothing is cached or stored locally.
 */
export function SnapViewer({ snap, sender, onClose }: { snap: OpenedSnap; sender: UserCard | null; onClose: () => void }) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [progress, setProgress] = useState(0);
  const [muted, setMuted] = useState(false);
  const [aspect, setAspect] = useState(9 / 16);
  const videoRef = useRef<HTMLVideoElement>(null);
  const reported = useRef(false);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  const src = mediaUrl(snap.mediaId);

  // Progress + auto close.
  useEffect(() => {
    if (!ready) return;
    const totalMs = (snap.durationSeconds ?? 10) * 1000;
    const started = performance.now();
    let raf = 0;
    const loop = () => {
      let p: number;
      if (snap.mediaKind === "video") {
        const v = videoRef.current;
        p = v && v.duration && Number.isFinite(v.duration) ? v.currentTime / v.duration : 0;
      } else {
        p = (performance.now() - started) / totalMs;
      }
      setProgress(Math.min(1, p));
      if (snap.mediaKind === "image" && p >= 1) {
        closeRef.current();
        return;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [ready, snap.durationSeconds, snap.mediaKind]);

  // Hard stop when the server-side view window closes.
  useEffect(() => {
    const left = new Date(snap.viewExpiresAt).getTime() - Date.now();
    const t = window.setTimeout(() => closeRef.current(), Math.max(0, left));
    return () => window.clearTimeout(t);
  }, [snap.viewExpiresAt]);

  // Keyboard: Escape closes; best-effort screenshot shortcut reporting.
  useEffect(() => {
    const report = () => {
      if (reported.current) return;
      reported.current = true;
      api
        .post(`/api/snaps/${snap.snapId}/screenshot`)
        .then(() => toast("Screenshot detected — the sender was notified.", { icon: "📸" }))
        .catch(() => undefined);
    };
    const onKey = (e: KeyboardEvent) => {
      if (isScreenshotShortcut(e)) report();
      else if (e.type === "keydown" && e.key === "Escape") closeRef.current();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
  }, [snap.snapId]);

  // Scroll lock while open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const remaining = snap.mediaKind === "image" ? Math.ceil((snap.durationSeconds ?? 10) * (1 - progress)) : null;

  return createPortal(
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-label={`Snap from ${sender?.display_name ?? "a friend"}`}
      className="fixed inset-0 z-[90] select-none bg-black text-white"
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <button type="button" className="absolute inset-0 h-full w-full cursor-default" onClick={onClose} aria-label="Close Snap" />
      <div className="pointer-events-none absolute inset-0">
        <FitFrame aspect={aspect}>
          {failed ? null : snap.mediaKind === "image" ? (
            // Snap media: short-lived signed URL, served only during the view window.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={src}
              alt={snap.caption || "Snap"}
              draggable={false}
              className="absolute inset-0 h-full w-full object-contain"
              onLoad={(e) => {
                const i = e.currentTarget;
                if (i.naturalWidth && i.naturalHeight) setAspect(i.naturalWidth / i.naturalHeight);
                setReady(true);
              }}
              onError={() => setFailed(true)}
            />
          ) : (
            <video
              ref={videoRef}
              src={src}
              autoPlay
              playsInline
              muted={muted}
              disablePictureInPicture
              controlsList="nodownload noplaybackrate"
              className="absolute inset-0 h-full w-full object-contain"
              onLoadedMetadata={(e) => {
                const v = e.currentTarget;
                if (v.videoWidth && v.videoHeight) setAspect(v.videoWidth / v.videoHeight);
              }}
              onPlaying={() => setReady(true)}
              onEnded={onClose}
              onError={() => setFailed(true)}
              onCanPlay={(e) => {
                e.currentTarget.play().catch(() => {
                  setMuted(true);
                  const v = videoRef.current;
                  if (v) {
                    v.muted = true;
                    void v.play().catch(() => undefined);
                  }
                });
              }}
            />
          )}
          <OverlayLayer overlays={snap.overlays} />
        </FitFrame>
      </div>

      {!ready && !failed ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-white/70" aria-label="Loading Snap" />
        </div>
      ) : null}
      {failed ? (
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 p-8 text-center" role="alert">
          <AlertTriangle className="h-8 w-8 text-white/70" />
          <p className="font-semibold">This Snap is no longer available.</p>
          <p className="text-sm text-white/60">Tap anywhere to close.</p>
        </div>
      ) : null}

      {/* Header */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center gap-3 bg-gradient-to-b from-black/60 to-transparent p-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <Avatar mediaId={sender?.avatar_media_id} name={sender?.display_name ?? sender?.username} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{sender?.display_name ?? "Snap"}</p>
          {snap.replayed ? <p className="text-xs text-white/70">Replay</p> : null}
        </div>
        {snap.mediaKind === "video" ? (
          <button
            type="button"
            onClick={() => setMuted((m) => !m)}
            className="pointer-events-auto rounded-full bg-black/40 p-2 backdrop-blur"
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </button>
        ) : null}
        <span className="relative flex h-10 w-10 items-center justify-center" aria-label={remaining !== null ? `${remaining} seconds left` : "Playing"}>
          <svg className="absolute inset-0 -rotate-90" viewBox="0 0 36 36" aria-hidden>
            <circle cx="18" cy="18" r="16" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="3" />
            <circle cx="18" cy="18" r="16" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeDasharray={RING} strokeDashoffset={RING * progress} />
          </svg>
          <span className="text-xs font-bold tabular-nums">{remaining ?? ""}</span>
        </span>
        <button type="button" onClick={onClose} className="pointer-events-auto rounded-full bg-black/40 p-2 backdrop-blur" aria-label="Close">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Caption + notice */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 space-y-3 bg-gradient-to-t from-black/70 to-transparent p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {snap.caption ? <p className="mx-auto max-w-md rounded-2xl bg-black/50 px-4 py-2 text-center text-sm font-semibold backdrop-blur">{snap.caption}</p> : null}
        <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-white/60">
          <Info className="h-3.5 w-3.5 shrink-0" />
          Browsers can&apos;t reliably detect screenshots — screenshot alerts are best-effort only.
        </p>
      </div>
    </motion.div>,
    document.body,
  );
}
