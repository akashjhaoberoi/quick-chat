import type { SupabaseClient } from "@supabase/supabase-js";
import type { Overlay, SnapRecipient, Streak, UserCard } from "@/types/models";

/**
 * Snap / streak / score queries shared by the browser (React Query, RLS via the
 * user's session) and the GET API routes (user-scoped server client). RLS
 * decides what each caller can see; nothing here trusts the client.
 */

export type InboxSnap = Pick<
  SnapRecipient,
  "snap_id" | "status" | "delivered_at" | "opened_at" | "view_expires_at" | "replay_count" | "screenshot_at"
> & {
  snap: {
    id: string;
    sender_id: string;
    media_kind: "image" | "video";
    caption: string;
    duration_seconds: number | null;
    view_once: boolean;
    allow_replay: boolean;
    expires_at: string;
    created_at: string;
    sender: UserCard | null;
  };
};

export type SentSnapRecipient = Pick<
  SnapRecipient,
  "recipient_id" | "status" | "delivered_at" | "opened_at" | "replay_count" | "screenshot_at"
> & { recipient: UserCard | null };

export type SentSnap = {
  id: string;
  media_kind: "image" | "video";
  caption: string;
  duration_seconds: number | null;
  view_once: boolean;
  allow_replay: boolean;
  expires_at: string;
  created_at: string;
  recipients: SentSnapRecipient[];
};

export type OpenedSnap = {
  snapId: string;
  mediaId: string;
  mediaKind: "image" | "video";
  durationSeconds: number | null;
  overlays: Overlay[];
  caption: string;
  viewExpiresAt: string;
  senderId: string;
  replayed: boolean;
};

export type ScoreEvent = { delta: number; reason: string; created_at: string };
export type ScoreData = { score: number; history: ScoreEvent[] };

const PROFILE_COLS = "id, username, display_name, avatar_media_id";

function fail(error: { message?: string; code?: string } | null): never {
  throw Object.assign(new Error(error?.message ?? "Request failed"), { code: error?.code });
}

/** Snaps sent to me. Unopened snaps whose expiry passed are hidden by RLS. */
export async function fetchInbox(supabase: SupabaseClient, userId: string): Promise<InboxSnap[]> {
  const { data, error } = await supabase
    .from("snap_recipients")
    .select(
      `snap_id, status, delivered_at, opened_at, view_expires_at, replay_count, screenshot_at,
       snap:snaps!inner(id, sender_id, media_kind, caption, duration_seconds, view_once, allow_replay, expires_at, created_at,
         sender:profiles!snaps_sender_id_fkey(${PROFILE_COLS}))`,
    )
    .eq("recipient_id", userId)
    .order("delivered_at", { ascending: false })
    .limit(100);
  if (error) fail(error);
  return (data ?? []) as unknown as InboxSnap[];
}

/** Snaps I sent with per-recipient status. */
export async function fetchSent(supabase: SupabaseClient, userId: string): Promise<SentSnap[]> {
  const { data, error } = await supabase
    .from("snaps")
    .select(
      `id, media_kind, caption, duration_seconds, view_once, allow_replay, expires_at, created_at,
       recipients:snap_recipients(recipient_id, status, delivered_at, opened_at, replay_count, screenshot_at,
         recipient:profiles!snap_recipients_recipient_id_fkey(${PROFILE_COLS}))`,
    )
    .eq("sender_id", userId)
    .order("created_at", { ascending: false })
    .limit(60);
  if (error) fail(error);
  return (data ?? []) as unknown as SentSnap[];
}

export async function fetchStreaks(supabase: SupabaseClient): Promise<Streak[]> {
  const { data, error } = await supabase.rpc("my_streaks");
  if (error) fail(error);
  return (data ?? []) as Streak[];
}

export async function fetchScore(supabase: SupabaseClient, userId: string): Promise<ScoreData> {
  const [score, history] = await Promise.all([
    supabase.from("user_scores").select("score").eq("user_id", userId).maybeSingle(),
    supabase.rpc("score_history", { p_limit: 60 }),
  ]);
  if (score.error) fail(score.error);
  if (history.error) fail(history.error);
  return { score: Number(score.data?.score ?? 0), history: (history.data ?? []) as ScoreEvent[] };
}

/** Effective recipient status: the maintenance job may not have marked an expired snap yet. */
export function effectiveStatus(
  r: { status: SnapRecipient["status"]; opened_at: string | null },
  expiresAt: string,
  now: number,
): SnapRecipient["status"] {
  if (r.status === "delivered" && new Date(expiresAt).getTime() <= now) return "expired";
  return r.status;
}

/** True while a replay is still possible for an opened snap (mirrors open_snap). */
export function canReplay(item: InboxSnap, now: number): boolean {
  return (
    item.status === "opened" &&
    item.snap.allow_replay &&
    item.replay_count < 1 &&
    item.opened_at !== null &&
    new Date(item.opened_at).getTime() > now - 24 * 3600 * 1000
  );
}

export const SCORE_REASONS: Record<string, { label: string; emoji: string }> = {
  snap_sent: { label: "Snap sent", emoji: "📤" },
  snap_opened: { label: "Snap opened", emoji: "👀" },
  story_posted: { label: "Story posted", emoji: "✨" },
  streak_day: { label: "Streak day", emoji: "🔥" },
  admin_adjust: { label: "Adjustment", emoji: "🛠️" },
};

/** Mirrors the "Score rules" comment in 20261102000400_snaps_stories_streaks.sql. */
export const SCORE_RULES = [
  { reason: "snap_sent", points: "+1 per recipient", cap: "max 10 per friend per day, 100 per day total" },
  { reason: "snap_opened", points: "+1 per Snap you open", cap: "100 per day" },
  { reason: "story_posted", points: "+2 per story", cap: "10 per day (5 stories)" },
  { reason: "streak_day", points: "+1 each time a streak day counts", cap: "50 per day" },
] as const;
