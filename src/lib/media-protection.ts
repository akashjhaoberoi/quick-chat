"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Browser-side media protection helpers. These raise the effort needed to save
 * or capture media through ordinary interactions; they cannot stop operating-
 * system screenshots, screen recording or a camera pointed at the screen.
 * The real protection is server-side: private storage, authorization and
 * short-lived signed URLs (see /api/media/[id]).
 */

/**
 * Screenshot shortcuts a page can sometimes observe: PrintScreen (Windows,
 * usually delivered on keyup), ⌘⇧3/4/5 (macOS, rarely delivered) and ⊞⇧S
 * (Windows Snipping Tool, sometimes delivered). Mobile screenshots are never
 * visible to a web page.
 */
export function isScreenshotShortcut(e: KeyboardEvent): boolean {
  if (e.key === "PrintScreen" || e.code === "PrintScreen") return true;
  if (e.metaKey && e.shiftKey && ["Digit3", "Digit4", "Digit5", "KeyS"].includes(e.code)) return true;
  return false;
}

/** Calls `onDetect` when a screenshot shortcut reaches the page. */
export function useScreenshotDetection(onDetect: () => void, enabled = true) {
  const cb = useRef(onDetect);
  useEffect(() => {
    cb.current = onDetect;
  });
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (isScreenshotShortcut(e)) cb.current();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
  }, [enabled]);
}

/**
 * True while the page is hidden (tab switched, app in the background, screen
 * locked) and, with `onBlur`, while the window doesn't have focus (another app,
 * the Snipping Tool overlay, the macOS screenshot toolbar). Event-driven, so a
 * page that starts unfocused isn't concealed until something changes.
 */
export function usePageConcealed({ onBlur = false }: { onBlur?: boolean } = {}): boolean {
  const [concealed, setConcealed] = useState(false);
  useEffect(() => {
    const hidden = () => document.visibilityState === "hidden";
    const onVisibility = () => setConcealed(hidden());
    const onWindowBlur = () => setConcealed(true);
    const onWindowFocus = () => setConcealed(hidden());
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onWindowBlur);
    window.addEventListener("pageshow", onVisibility);
    if (onBlur) {
      window.addEventListener("blur", onWindowBlur);
      window.addEventListener("focus", onWindowFocus);
    }
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onWindowBlur);
      window.removeEventListener("pageshow", onVisibility);
      window.removeEventListener("blur", onWindowBlur);
      window.removeEventListener("focus", onWindowFocus);
    };
  }, [onBlur]);
  return concealed;
}

/** Calls `onHidden` when the page is hidden (used to close view-once media). */
export function useOnPageHidden(onHidden: () => void, enabled = true) {
  const cb = useRef(onHidden);
  useEffect(() => {
    cb.current = onHidden;
  });
  useEffect(() => {
    if (!enabled) return;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") cb.current();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onVisibility);
    };
  }, [enabled]);
}

/**
 * A short, stable, non-reversible tag for a user id (FNV-1a, base 36). Lets a
 * leaked capture be traced to an account without printing the id or email.
 */
export function viewerTag(userId: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < userId.length; i++) {
    h ^= userId.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36).toUpperCase().padStart(7, "0").slice(-7);
}

/** Stops the browser's image menu and drag-to-save on protected elements. */
export const blockSaveGestures = {
  onContextMenu: (e: { preventDefault: () => void }) => e.preventDefault(),
  onDragStart: (e: { preventDefault: () => void }) => e.preventDefault(),
};
