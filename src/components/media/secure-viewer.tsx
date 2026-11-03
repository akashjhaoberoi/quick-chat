"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Lock, X } from "lucide-react";
import { toast } from "sonner";
import { Dialog } from "@/components/ui/dialog";
import { ProtectedImage, PrivacyShield, Watermark } from "@/components/media/protected-media";
import { blockSaveGestures, useOnPageHidden, usePageConcealed, useScreenshotDetection } from "@/lib/media-protection";
import { formatDuration } from "@/lib/utils";

export type SecureItem = { src: string; kind: "image" | "video" };

/**
 * Full-screen viewer for protected media: no download, no context menu or
 * drag, viewer watermark, media hidden whenever the window loses focus or the
 * page is hidden, and an optional hard expiry (view-once window).
 */
export function SecureViewer({
  items,
  index = 0,
  onClose,
  label,
  watermark = true,
  notice,
  expiresAt,
  closeOnHide = false,
  onScreenshot,
}: {
  items: SecureItem[];
  index?: number;
  onClose: () => void;
  label: string;
  watermark?: boolean;
  /** Short banner, e.g. "Protected · downloading is off". */
  notice?: string;
  /** Closes the viewer at this time (view-once window). */
  expiresAt?: string | null;
  /** Close as soon as the page is hidden (view once: leaving ends the view). */
  closeOnHide?: boolean;
  /** Reports a detected screenshot shortcut; resolves true if the owner was notified. */
  onScreenshot?: () => Promise<boolean>;
}) {
  const [i, setI] = useState(index);
  const [now, setNow] = useState(() => Date.now());
  const concealed = usePageConcealed({ onBlur: true });
  const video = useRef<HTMLVideoElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });
  const item = items[i];

  useOnPageHidden(() => closeRef.current(), closeOnHide);

  // One shortcut fires keydown and keyup; report at most once a minute.
  const lastReport = useRef(0);
  useScreenshotDetection(() => {
    if (!onScreenshot || Date.now() - lastReport.current < 60_000) return;
    lastReport.current = Date.now();
    void onScreenshot()
      .then((reported) => {
        if (reported) toast("Screenshot detected — the sender was notified.", { icon: "📸" });
      })
      .catch(() => undefined);
  });

  useEffect(() => {
    if (concealed) video.current?.pause();
  }, [concealed]);

  useEffect(() => {
    if (!expiresAt) return;
    const end = new Date(expiresAt).getTime();
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    const stop = window.setTimeout(() => closeRef.current(), Math.max(0, end - Date.now()));
    return () => {
      window.clearInterval(tick);
      window.clearTimeout(stop);
    };
  }, [expiresAt]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setI((x) => Math.min(items.length - 1, x + 1));
      if (e.key === "ArrowLeft") setI((x) => Math.max(0, x - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [items.length]);

  const left = expiresAt ? Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 1000)) : null;

  return (
    <Dialog open onClose={onClose} variant="fullscreen" hideClose className="bg-black text-white">
      <div
        className="qc-protected relative flex h-full min-h-[70dvh] select-none items-center justify-center"
        aria-label={label}
        data-testid="secure-viewer"
        {...blockSaveGestures}
      >
        <div className="absolute left-0 right-0 top-0 z-30 flex items-start justify-between gap-2">
          <p className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold">
            <Lock className="h-3.5 w-3.5" aria-hidden />
            {notice ?? "Protected"}
            {left !== null ? <span className="tabular-nums" data-testid="view-countdown"> · closes in {formatDuration(left)}</span> : null}
          </p>
          <button type="button" onClick={onClose} className="rounded-full bg-white/10 p-2.5 hover:bg-white/20" aria-label="Close viewer">
            <X className="h-5 w-5" />
          </button>
        </div>

        {item?.kind === "video" ? (
          <div className="relative max-h-[85dvh] max-w-full overflow-hidden rounded-xl">
            <video
              ref={video}
              src={item.src}
              controls
              autoPlay
              playsInline
              disablePictureInPicture
              controlsList="nodownload noplaybackrate noremoteplayback"
              className={concealed ? "invisible max-h-[85dvh] max-w-full" : "max-h-[85dvh] max-w-full"}
            />
            {watermark ? <Watermark /> : null}
            <PrivacyShield show={concealed} />
          </div>
        ) : item ? (
          <ProtectedImage
            src={item.src}
            className="inline-block max-w-full rounded-xl"
            imgClassName="max-h-[85dvh] max-w-full object-contain"
            hidden={concealed}
          >
            {watermark ? <Watermark /> : null}
            <PrivacyShield show={concealed} />
          </ProtectedImage>
        ) : null}

        {items.length > 1 ? (
          <>
            <button type="button" disabled={i === 0} onClick={() => setI(i - 1)} className="absolute left-0 z-30 rounded-full bg-white/10 p-3 disabled:opacity-30" aria-label="Previous">
              <ChevronLeft className="h-6 w-6" />
            </button>
            <button type="button" disabled={i === items.length - 1} onClick={() => setI(i + 1)} className="absolute right-0 z-30 rounded-full bg-white/10 p-3 disabled:opacity-30" aria-label="Next">
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
