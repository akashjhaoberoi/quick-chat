"use client";

import { useEffect, useState, type ReactNode, type SyntheticEvent } from "react";
import { EyeOff } from "lucide-react";
import { useSession } from "@/components/providers/session-provider";
import { blockSaveGestures, viewerTag } from "@/lib/media-protection";
import { cn } from "@/lib/utils";

/**
 * An image that resists the ordinary ways of saving it: no context menu, no
 * drag, no selection, no iOS long-press "Save to Photos" (a transparent layer
 * sits above the image) and hidden when printed. Developer tools and
 * screenshots can still capture it; storage access control is what keeps the
 * file itself private.
 */
export function ProtectedImage({
  src,
  alt = "",
  className,
  imgClassName,
  loading,
  onLoad,
  onError,
  hidden,
  children,
}: {
  src: string;
  alt?: string;
  className?: string;
  imgClassName?: string;
  loading?: "lazy" | "eager";
  onLoad?: (e: SyntheticEvent<HTMLImageElement>) => void;
  onError?: () => void;
  /** Keeps the layout but doesn't paint the image (privacy shield). */
  hidden?: boolean;
  children?: ReactNode;
}) {
  return (
    <span className={cn("qc-protected relative block overflow-hidden", className)} {...blockSaveGestures} data-protected-media>
      {/* Signed, short-lived URLs from /api/media are not suitable for next/image. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        draggable={false}
        loading={loading}
        decoding="async"
        onLoad={onLoad}
        onError={onError}
        className={cn("pointer-events-none select-none", hidden && "invisible", imgClassName)}
      />
      <span aria-hidden className="absolute inset-0" />
      {children}
    </span>
  );
}

const SPOTS = [
  { top: "14%", left: "8%" },
  { top: "62%", left: "34%" },
  { top: "36%", left: "52%" },
  { top: "78%", left: "6%" },
  { top: "24%", left: "38%" },
  { top: "50%", left: "12%" },
];

/**
 * Dynamic viewer watermark: Quick Chat, the viewer's @username, a short
 * account tag and the current time. Two labels move every few seconds so they
 * can't be cropped out of one corner. No email or other personal details.
 */
export function Watermark({ className, compact }: { className?: string; compact?: boolean }) {
  const { me } = useSession();
  const [step, setStep] = useState(0);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => {
      setStep((s) => s + 1);
      setNow(new Date());
    }, 6000);
    return () => window.clearInterval(t);
  }, []);
  if (!me) return null;
  const stamp = now.toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const text = `Quick Chat · @${me.profile.username} · ${viewerTag(me.user.id)} · ${stamp}`;
  const spots = compact ? [SPOTS[step % SPOTS.length]] : [SPOTS[step % SPOTS.length], SPOTS[(step + 3) % SPOTS.length]];
  return (
    <span aria-hidden data-testid="watermark" className={cn("pointer-events-none absolute inset-0 z-10 select-none overflow-hidden", className)}>
      {spots.map((pos, i) => (
        <span
          key={i}
          className={cn(
            "absolute whitespace-nowrap font-semibold tracking-wide text-white/40 transition-all duration-1000 [text-shadow:0_0_3px_rgba(0,0,0,.45)]",
            compact ? "text-[9px]" : "text-[11px] sm:text-xs",
          )}
          style={{ ...pos, transform: "rotate(-16deg)" }}
        >
          {text}
        </span>
      ))}
    </span>
  );
}

/** Covers sensitive media while Quick Chat is in the background or unfocused. */
export function PrivacyShield({ show, message = "Hidden while Quick Chat isn't in focus" }: { show: boolean; message?: string }) {
  if (!show) return null;
  return (
    <span
      role="status"
      data-testid="privacy-shield"
      className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-black/85 p-4 text-center text-sm font-semibold text-white backdrop-blur-2xl"
    >
      <EyeOff className="h-6 w-6" aria-hidden />
      {message}
    </span>
  );
}
