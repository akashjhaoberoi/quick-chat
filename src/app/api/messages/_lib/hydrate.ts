import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { unwrap } from "@/lib/api/handler";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { log } from "@/lib/log";
import type { Message } from "@/types/models";
import type { AttachmentInfo, ChatMessage, ReplyPreview, ViewOnceState } from "@/components/chat/types";

export const MESSAGE_COLUMNS =
  "id, conversation_id, sender_id, type, body, metadata, reply_to_id, forwarded, client_id, edited_at, deleted_at, expires_at, pinned_at, pinned_by, created_at";

type MediaRow = Omit<AttachmentInfo, "media_id" | "position"> & { id: string; status: string };

/**
 * Adds attachments (with media metadata), reactions, starred flag and reply
 * previews to messages the caller could already read through RLS.
 * Media metadata is read with the service role because media_assets RLS only
 * exposes a user's own uploads; the ids come from RLS-visible attachments, so
 * the read is already authorized.
 */
export async function hydrateMessages(supabase: SupabaseClient, userId: string, rows: Message[]): Promise<ChatMessage[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((m) => m.id);
  const replyIds = Array.from(new Set(rows.map((m) => m.reply_to_id).filter((x): x is string => Boolean(x))));
  // media_mode is read separately so a database without the media-protection
  // migration still serves messages (all treated as normal).
  const modeRows = await supabase.from("messages").select("id, media_mode").in("id", ids).limit(1000);
  if (modeRows.error) log("warn", "message_media_mode_unavailable", { error: modeRows.error.message });
  const modes = new Map(((modeRows.data ?? []) as { id: string; media_mode: Message["media_mode"] }[]).map((r) => [r.id, r.media_mode]));
  rows = rows.map((m) => ({ ...m, media_mode: modes.get(m.id) ?? m.media_mode ?? "normal" }));
  const viewOnceIds = rows.filter((m) => m.media_mode === "view_once").map((m) => m.id);

  const [attachments, reactions, starred, replies, views] = await Promise.all([
    supabase.from("message_attachments").select("message_id, media_id, position").in("message_id", ids).limit(1000),
    supabase.from("message_reactions").select("message_id, user_id, emoji").in("message_id", ids).limit(5000),
    supabase.from("starred_messages").select("message_id").eq("user_id", userId).in("message_id", ids).limit(1000),
    replyIds.length
      ? supabase.from("messages").select("id, sender_id, type, body, deleted_at").in("id", replyIds).limit(500)
      : Promise.resolve({ data: [], error: null }),
    // RLS: a viewer sees their own view; the sender sees everyone's.
    viewOnceIds.length
      ? supabase.from("message_media_views").select("message_id, viewer_id, view_expires_at").in("message_id", viewOnceIds).limit(5000)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const att = unwrap(attachments) as { message_id: string; media_id: string; position: number }[];
  const mediaIds = Array.from(new Set(att.map((a) => a.media_id)));
  const media = new Map<string, MediaRow>();
  if (mediaIds.length) {
    try {
      const { data } = await getSupabaseAdmin()
        .from("media_assets")
        .select("id, kind, mime_type, size_bytes, width, height, duration_ms, file_name, status")
        .in("id", mediaIds);
      for (const m of (data ?? []) as MediaRow[]) media.set(m.id, m);
    } catch (err) {
      log("error", "chat_media_metadata_failed", { error: (err as Error).message });
    }
  }

  const attByMsg = new Map<string, AttachmentInfo[]>();
  for (const a of att) {
    const m = media.get(a.media_id);
    const info: AttachmentInfo = {
      media_id: a.media_id,
      position: a.position,
      kind: m?.kind ?? null,
      mime_type: m?.mime_type ?? null,
      size_bytes: m?.size_bytes != null ? Number(m.size_bytes) : null,
      width: m?.width ?? null,
      height: m?.height ?? null,
      duration_ms: m?.duration_ms ?? null,
      file_name: m?.file_name ?? null,
    };
    const list = attByMsg.get(a.message_id) ?? [];
    list.push(info);
    attByMsg.set(a.message_id, list);
  }

  const reactByMsg = new Map<string, { user_id: string; emoji: string }[]>();
  for (const r of unwrap(reactions) as { message_id: string; user_id: string; emoji: string }[]) {
    const list = reactByMsg.get(r.message_id) ?? [];
    list.push({ user_id: r.user_id, emoji: r.emoji });
    reactByMsg.set(r.message_id, list);
  }
  const starredSet = new Set((unwrap(starred) as { message_id: string }[]).map((s) => s.message_id));
  const replyMap = new Map<string, ReplyPreview>();
  for (const r of (unwrap(replies) ?? []) as { id: string; sender_id: string | null; type: Message["type"]; body: string | null; deleted_at: string | null }[]) {
    replyMap.set(r.id, { id: r.id, sender_id: r.sender_id, type: r.type, body: r.body ? r.body.slice(0, 200) : null, deleted: Boolean(r.deleted_at) });
  }

  const viewRows = (unwrap(views) ?? []) as { message_id: string; viewer_id: string; view_expires_at: string }[];
  const viewOnce = (m: Message): ViewOnceState | undefined => {
    if (m.media_mode !== "view_once") return undefined;
    const mine = viewRows.find((v) => v.message_id === m.id && v.viewer_id === userId);
    const atts = attByMsg.get(m.id) ?? [];
    return {
      my_view_expires_at: mine?.view_expires_at ?? null,
      opened_count: m.sender_id === userId ? viewRows.filter((v) => v.message_id === m.id).length : 0,
      expired: atts.length > 0 && atts.every((a) => media.get(a.media_id)?.status !== "ready"),
    };
  };

  return rows.map((m) => ({
    ...m,
    view_once: viewOnce(m),
    attachments: (attByMsg.get(m.id) ?? []).sort((a, b) => a.position - b.position),
    reactions: reactByMsg.get(m.id) ?? [],
    starred: starredSet.has(m.id),
    reply_to: m.reply_to_id ? replyMap.get(m.reply_to_id) ?? null : null,
  }));
}
