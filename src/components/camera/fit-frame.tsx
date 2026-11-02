"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Fills its parent and renders a centered box with the given aspect ratio
 * (width / height), as large as fits. Children are positioned inside the box,
 * so normalized overlays line up exactly with the media.
 */
export function FitFrame({ aspect, children, className, frameClassName }: { aspect: number; children: ReactNode; className?: string; frameClassName?: string }) {
  const outer = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const el = outer.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setBox({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  let w = 0;
  let h = 0;
  if (box && aspect > 0) {
    w = box.w;
    h = w / aspect;
    if (h > box.h) {
      h = box.h;
      w = h * aspect;
    }
  }

  return (
    <div ref={outer} className={cn("relative flex h-full w-full items-center justify-center overflow-hidden", className)}>
      {box ? (
        <div className={cn("relative shrink-0", frameClassName)} style={{ width: Math.floor(w), height: Math.floor(h) }}>
          {children}
        </div>
      ) : null}
    </div>
  );
}
