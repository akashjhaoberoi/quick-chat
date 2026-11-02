"use client";

import type { CSSProperties } from "react";
import type { Overlay } from "@/types/models";
import { cn } from "@/lib/utils";

/**
 * Read-only rendering of normalized overlays (x/y = centre, size = fraction of
 * the frame width). Sizes use container query units, so the parent must be
 * the media frame; this component sets `container-type` itself.
 */
export function OverlayLayer({ overlays, className }: { overlays: Overlay[] | null | undefined; className?: string }) {
  if (!overlays?.length) return null;
  return (
    <div className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)} style={{ containerType: "size" }} aria-hidden>
      {overlays.map((o, i) => (
        <span key={i} style={overlayStyle(o)} className={overlayClass(o)}>
          {o.type === "text" ? o.text : o.emoji}
        </span>
      ))}
    </div>
  );
}

export function overlayStyle(o: Overlay): CSSProperties {
  return {
    left: `${o.x * 100}%`,
    top: `${o.y * 100}%`,
    transform: `translate(-50%, -50%) rotate(${o.rotation ?? 0}deg)`,
    fontSize: `${o.size * 100}cqw`,
    color: o.type === "text" ? o.color : undefined,
  };
}

export function overlayClass(o: Overlay): string {
  return cn(
    "absolute select-none whitespace-pre leading-none",
    o.type === "text" && "font-extrabold [text-shadow:0_1px_6px_rgba(0,0,0,0.55)]",
  );
}

/** Draws overlays onto a canvas with the same geometry as OverlayLayer. */
export function drawOverlays(ctx: CanvasRenderingContext2D, overlays: Overlay[], width: number, height: number) {
  for (const o of overlays) {
    const px = o.size * width;
    ctx.save();
    ctx.translate(o.x * width, o.y * height);
    ctx.rotate(((o.rotation ?? 0) * Math.PI) / 180);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (o.type === "text") {
      ctx.font = `800 ${px}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif`;
      ctx.shadowColor = "rgba(0,0,0,0.55)";
      ctx.shadowBlur = px * 0.25;
      ctx.shadowOffsetY = px * 0.05;
      ctx.fillStyle = o.color;
      ctx.fillText(o.text, 0, 0);
    } else {
      ctx.font = `${px}px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif`;
      ctx.fillText(o.emoji, 0, 0);
    }
    ctx.restore();
  }
}
