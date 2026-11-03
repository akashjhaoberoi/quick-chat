"use client";

import { useState } from "react";
import { blockSaveGestures } from "@/lib/media-protection";
import { cn, initials, mediaUrl } from "@/lib/utils";

const SIZES = {
  xs: "h-6 w-6 text-[10px]",
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-lg",
  xl: "h-20 w-20 text-2xl",
  "2xl": "h-28 w-28 text-3xl",
} as const;

const PALETTE = ["#7c5cff", "#ff5e7e", "#12b76a", "#f79009", "#2e90fa", "#c065f5", "#ef6820", "#15b79e"];

function colorFor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

export type AvatarProps = {
  mediaId?: string | null;
  name?: string | null;
  size?: keyof typeof SIZES;
  online?: boolean;
  /** Story ring: "unseen" (gradient), "seen" (grey) or none. */
  ring?: "unseen" | "seen" | null;
  className?: string;
};

export function Avatar({ mediaId, name, size = "md", online, ring, className }: AvatarProps) {
  const [failed, setFailed] = useState(false);
  const src = !failed ? mediaUrl(mediaId) : undefined;
  const inner = (
    <span
      className={cn("relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold text-white", SIZES[size])}
      style={{ background: src ? "var(--surface-3)" : colorFor(name ?? "?") }}
    >
      {src ? (
        // Signed, short-lived URLs from /api/media are not suitable for next/image optimisation.
        // Profile photos resist ordinary saving: no context menu, drag or long-press save.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          draggable={false}
          {...blockSaveGestures}
          className="qc-protected h-full w-full select-none object-cover"
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      ) : (
        <span aria-hidden>{initials(name)}</span>
      )}
    </span>
  );
  return (
    <span className={cn("relative inline-flex shrink-0", className)} aria-label={name ?? undefined} role={name ? "img" : undefined}>
      {ring ? (
        <span className={cn("rounded-full p-[2.5px]", ring === "unseen" ? "story-ring" : "bg-border")}>
          <span className="block rounded-full bg-surface p-[2px]">{inner}</span>
        </span>
      ) : (
        inner
      )}
      {online ? (
        <span className="absolute bottom-0 right-0 block h-3 w-3 rounded-full border-2 border-surface bg-success" aria-label="Online" />
      ) : null}
    </span>
  );
}
