import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { differenceInCalendarDays, format, formatDistanceToNowStrict, isToday, isYesterday } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** URL of a stored media object; the API authorizes and redirects to a signed URL. */
export function mediaUrl(mediaId: string | null | undefined, opts?: { download?: boolean }): string | undefined {
  if (!mediaId) return undefined;
  return `/api/media/${mediaId}${opts?.download ? "?download=1" : ""}`;
}

export function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function displayName(p: { display_name?: string | null; username?: string | null } | null | undefined): string {
  if (!p) return "Unknown user";
  return p.display_name?.trim() || p.username || "Unknown user";
}

const ONLINE_WINDOW_MS = 2 * 60 * 1000;

export function isOnline(lastSeenAt: string | null | undefined): boolean {
  return Boolean(lastSeenAt && Date.now() - new Date(lastSeenAt).getTime() < ONLINE_WINDOW_MS);
}

export function lastSeenLabel(lastSeenAt: string | null | undefined): string | null {
  if (!lastSeenAt) return null;
  if (isOnline(lastSeenAt)) return "Online";
  return `Active ${formatDistanceToNowStrict(new Date(lastSeenAt), { addSuffix: true })}`;
}

export function shortTime(iso: string): string {
  const d = new Date(iso);
  if (isToday(d)) return format(d, "HH:mm");
  if (isYesterday(d)) return "Yesterday";
  if (differenceInCalendarDays(new Date(), d) < 7) return format(d, "EEE");
  return format(d, "dd MMM");
}

export function relativeTime(iso: string): string {
  return formatDistanceToNowStrict(new Date(iso), { addSuffix: true });
}

export function dayLabel(iso: string): string {
  const d = new Date(iso);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "EEEE, d MMMM yyyy");
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(h ? 2 : 1, "0");
  const ss = String(sec).padStart(2, "0");
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

export function compactNumber(n: number): string {
  return new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

const URL_RE = /\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]]/gi;

/** Splits text into plain and link segments for safe rendering (no HTML injection). */
export function linkify(text: string): { type: "text" | "link"; value: string }[] {
  const out: { type: "text" | "link"; value: string }[] = [];
  let last = 0;
  for (const match of text.matchAll(URL_RE)) {
    const idx = match.index ?? 0;
    if (idx > last) out.push({ type: "text", value: text.slice(last, idx) });
    out.push({ type: "link", value: match[0] });
    last = idx + match[0].length;
  }
  if (last < text.length) out.push({ type: "text", value: text.slice(last) });
  return out;
}

export function firstUrl(text: string | null | undefined): string | null {
  if (!text) return null;
  const m = text.match(URL_RE);
  return m ? m[0] : null;
}

export function newClientId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
