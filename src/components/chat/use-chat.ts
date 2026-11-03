"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { api, ClientApiError, errorMessage } from "@/lib/api/client";
import { qk } from "@/lib/query-keys";
import { uploadMedia, type UploadHandle } from "@/lib/upload";
import { useRealtimeEvent } from "@/components/providers/realtime-provider";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { newClientId } from "@/lib/utils";
import type { ConversationMember, MediaMode, Message, MessageType } from "@/types/models";
import type { ChatMessage, ConversationDetail, DeliveryStatus, MessagePage, ReplyPreview } from "./types";

export const PAGE_SIZE = 40;
export const MEDIA_TYPES: MessageType[] = ["image", "video", "voice", "gif", "document"];
export const FAR_FUTURE = "9999-12-31T23:59:59.000Z";

type Pages = InfiniteData<MessagePage, string | null>;

// ---------------------------------------------------------------------------
// Cache helpers
// ---------------------------------------------------------------------------
export function flattenPages(data: InfiniteData<MessagePage, unknown> | undefined): ChatMessage[] {
  if (!data) return [];
  const seen = new Set<string>();
  const out: ChatMessage[] = [];
  for (let i = data.pages.length - 1; i >= 0; i--) {
    for (const m of data.pages[i].messages) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      out.push(m);
    }
  }
  return out;
}

export function upsertMessage(qc: QueryClient, conversationId: string, msg: ChatMessage) {
  qc.setQueryData<Pages>(qk.messages(conversationId), (data) => {
    if (!data) return data;
    let found = false;
    const pages = data.pages.map((p) => ({
      ...p,
      messages: p.messages.map((m) => {
        if (m.id === msg.id) {
          found = true;
          return msg;
        }
        return m;
      }),
    }));
    if (!found) {
      const first = pages[0] ?? { messages: [], hasMore: false };
      pages[0] = { ...first, messages: [...first.messages, msg].sort((a, b) => a.created_at.localeCompare(b.created_at)) };
    }
    return { ...data, pages };
  });
}

export function patchMessage(qc: QueryClient, conversationId: string, id: string, fn: (m: ChatMessage) => ChatMessage | null) {
  qc.setQueryData<Pages>(qk.messages(conversationId), (data) => {
    if (!data) return data;
    return {
      ...data,
      pages: data.pages.map((p) => ({
        ...p,
        messages: p.messages.flatMap((m) => {
          if (m.id !== id) return [m];
          const next = fn(m);
          return next ? [next] : [];
        }),
      })),
    };
  });
}

function bare(m: Message): ChatMessage {
  return { ...m, metadata: m.metadata ?? {}, attachments: [], reactions: [], starred: false, reply_to: null };
}

// ---------------------------------------------------------------------------
// Conversation detail (members, group, my state)
// ---------------------------------------------------------------------------
export function useConversationDetail(id: string) {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: qk.conversation(id),
    queryFn: () => api.get<ConversationDetail>(`/api/conversations/${id}`),
  });

  useRealtimeEvent("conversation_members", (e) => {
    const row = (e.eventType === "DELETE" ? e.old : e.new) as Partial<ConversationMember>;
    if (row.conversation_id !== id) return;
    const current = qc.getQueryData<ConversationDetail>(qk.conversation(id));
    const known = current?.members.find((m) => m.user_id === row.user_id);
    if (e.eventType === "UPDATE" && current && known && known.left_at === (row.left_at ?? null) && known.role === row.role) {
      // Receipt-only change: patch in place, no refetch.
      qc.setQueryData<ConversationDetail>(qk.conversation(id), {
        ...current,
        members: current.members.map((m) => (m.user_id === row.user_id ? { ...m, ...(row as ConversationMember) } : m)),
      });
    } else {
      void qc.invalidateQueries({ queryKey: qk.conversation(id) });
    }
  });
  useRealtimeEvent("groups", (e) => {
    const row = e.new as { conversation_id?: string };
    if (row.conversation_id === id) void qc.invalidateQueries({ queryKey: qk.conversation(id) });
  });
  useRealtimeEvent("conversations", (e) => {
    const row = e.new as { id?: string };
    if (row.id === id) void qc.invalidateQueries({ queryKey: qk.conversation(id) });
  });
  return query;
}

export function deliveryStatus(msg: Pick<ChatMessage, "created_at">, members: ConversationMember[], meId: string): DeliveryStatus {
  const others = members.filter((m) => m.user_id !== meId && !m.left_at);
  if (others.length === 0) return "sent";
  const t = Date.parse(msg.created_at);
  if (others.every((m) => m.last_read_public_at && Date.parse(m.last_read_public_at) >= t)) return "read";
  if (others.every((m) => m.last_delivered_at && Date.parse(m.last_delivered_at) >= t)) return "delivered";
  return "sent";
}

// ---------------------------------------------------------------------------
// Messages (paginated + realtime)
// ---------------------------------------------------------------------------
export function useMessages(conversationId: string, onIncoming?: (m: ChatMessage) => void) {
  const qc = useQueryClient();
  const query = useInfiniteQuery({
    queryKey: qk.messages(conversationId),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      api.get<MessagePage>(`/api/conversations/${conversationId}/messages`, { before: pageParam ?? undefined, limit: PAGE_SIZE }),
    getNextPageParam: (last) => (last.hasMore && last.messages.length ? last.messages[0].created_at : null),
    staleTime: 15_000,
  });

  useRealtimeEvent("messages", (e) => {
    if (e.eventType === "DELETE") {
      const old = e.old as { id?: string };
      if (old.id) patchMessage(qc, conversationId, old.id, () => null);
      return;
    }
    const row = e.new as unknown as Message;
    if (row.conversation_id !== conversationId) return;
    if (e.eventType === "INSERT") {
      const needsHydration = MEDIA_TYPES.includes(row.type) || Boolean(row.reply_to_id);
      const apply = (m: ChatMessage) => {
        upsertMessage(qc, conversationId, m);
        onIncoming?.(m);
      };
      if (needsHydration) {
        api.get<ChatMessage>(`/api/messages/${row.id}`).then(apply, () => apply(bare(row)));
      } else {
        apply(bare(row));
      }
    } else {
      patchMessage(qc, conversationId, row.id, (m) => ({
        ...m,
        ...row,
        metadata: row.metadata ?? {},
        attachments: row.deleted_at ? [] : m.attachments,
        reactions: row.deleted_at ? [] : m.reactions,
        starred: row.deleted_at ? false : m.starred,
      }));
      if (row.pinned_at !== undefined) void qc.invalidateQueries({ queryKey: ["pinned", conversationId] });
    }
  });

  useRealtimeEvent("message_reactions", (e) => {
    if (e.eventType === "DELETE") {
      const old = e.old as { message_id?: string; user_id?: string };
      if (!old.message_id) return;
      patchMessage(qc, conversationId, old.message_id, (m) => ({ ...m, reactions: m.reactions.filter((r) => r.user_id !== old.user_id) }));
      return;
    }
    const row = e.new as { message_id: string; user_id: string; emoji: string };
    patchMessage(qc, conversationId, row.message_id, (m) => ({
      ...m,
      reactions: [...m.reactions.filter((r) => r.user_id !== row.user_id), { user_id: row.user_id, emoji: row.emoji }],
    }));
  });

  return query;
}

export function usePinnedMessages(conversationId: string) {
  return useQuery({
    queryKey: ["pinned", conversationId],
    queryFn: () => api.get<MessagePage>(`/api/conversations/${conversationId}/messages`, { pinned: 1 }).then((p) => p.messages),
  });
}

// ---------------------------------------------------------------------------
// Outbox: optimistic sends with uploads, progress, cancel and retry
// ---------------------------------------------------------------------------
export type OutboxFile = { file: File | Blob; name: string; previewUrl: string; kind: "image" | "video" | "audio" | "document"; progress: number; mediaId?: string; durationMs?: number };

export type OutboxItem = {
  clientId: string;
  conversationId: string;
  type: MessageType;
  body?: string;
  metadata?: Record<string, unknown>;
  replyTo: ReplyPreview | null;
  files: OutboxFile[];
  createdAt: string;
  mediaMode?: MediaMode;
  status: "uploading" | "sending" | "failed";
  error?: string;
};

export type Draft = {
  type: MessageType;
  body?: string;
  metadata?: Record<string, unknown>;
  replyTo?: ReplyPreview | null;
  files?: { file: File | Blob; name: string; kind: OutboxFile["kind"]; durationMs?: number }[];
  mediaMode?: MediaMode;
};

export function useOutbox(conversationId: string) {
  const qc = useQueryClient();
  const [items, setItems] = useState<OutboxItem[]>([]);
  const itemsRef = useRef<OutboxItem[]>([]);
  const handles = useRef(new Map<string, UploadHandle[]>());
  const cancelled = useRef(new Set<string>());

  const commit = useCallback((fn: (list: OutboxItem[]) => OutboxItem[]) => {
    itemsRef.current = fn(itemsRef.current);
    setItems(itemsRef.current);
  }, []);
  const update = useCallback(
    (clientId: string, patch: Partial<OutboxItem> | ((i: OutboxItem) => Partial<OutboxItem>)) =>
      commit((list) => list.map((i) => (i.clientId === clientId ? { ...i, ...(typeof patch === "function" ? patch(i) : patch) } : i))),
    [commit],
  );
  const remove = useCallback(
    (clientId: string) => {
      const item = itemsRef.current.find((i) => i.clientId === clientId);
      item?.files.forEach((f) => URL.revokeObjectURL(f.previewUrl));
      handles.current.get(clientId)?.forEach((h) => h.cancel());
      handles.current.delete(clientId);
      commit((list) => list.filter((i) => i.clientId !== clientId));
    },
    [commit],
  );

  const process = useCallback(
    async (clientId: string) => {
      const item = itemsRef.current.find((i) => i.clientId === clientId);
      if (!item) return;
      try {
        const pending = item.files.map((f, idx) => ({ f, idx })).filter(({ f }) => !f.mediaId);
        if (pending.length) {
          update(clientId, { status: "uploading", error: undefined });
          const list = pending.map(({ f, idx }) => {
            const h = uploadMedia(f.file, {
              purpose: "message",
              durationMs: f.durationMs,
              onProgress: (p) =>
                update(clientId, (i) => ({ files: i.files.map((x, j) => (j === idx ? { ...x, progress: p } : x)) })),
            });
            return { h, idx };
          });
          handles.current.set(clientId, list.map((x) => x.h));
          const results = await Promise.all(list.map(async ({ h, idx }) => ({ idx, media: await h.promise })));
          update(clientId, (i) => ({
            files: i.files.map((x, j) => {
              const r = results.find((res) => res.idx === j);
              return r ? { ...x, mediaId: r.media.id, progress: 1 } : x;
            }),
          }));
          handles.current.delete(clientId);
        }
        if (cancelled.current.has(clientId)) return;
        update(clientId, { status: "sending", error: undefined });
        const current = itemsRef.current.find((i) => i.clientId === clientId);
        if (!current) return;
        const mediaIds = current.files.map((f) => f.mediaId).filter((x): x is string => Boolean(x));
        const msg = await api.post<ChatMessage>("/api/messages", {
          conversationId,
          type: current.type,
          body: current.body || undefined,
          metadata: current.metadata,
          replyTo: current.replyTo?.id,
          clientId,
          mediaIds: mediaIds.length ? mediaIds : undefined,
          mediaMode: current.mediaMode && current.mediaMode !== "normal" ? current.mediaMode : undefined,
        });
        upsertMessage(qc, conversationId, msg);
        remove(clientId);
        void qc.invalidateQueries({ queryKey: qk.conversationsAll });
      } catch (err) {
        if (cancelled.current.has(clientId) || (err instanceof ClientApiError && err.code === "cancelled")) {
          remove(clientId);
          return;
        }
        update(clientId, { status: "failed", error: errorMessage(err) });
      }
    },
    [conversationId, qc, remove, update],
  );

  const send = useCallback(
    (draft: Draft) => {
      const clientId = newClientId();
      const item: OutboxItem = {
        clientId,
        conversationId,
        type: draft.type,
        body: draft.body,
        metadata: draft.metadata,
        replyTo: draft.replyTo ?? null,
        files: (draft.files ?? []).map((f) => ({ ...f, previewUrl: URL.createObjectURL(f.file), progress: 0 })),
        createdAt: new Date().toISOString(),
        mediaMode: draft.mediaMode,
        status: draft.files?.length ? "uploading" : "sending",
      };
      commit((list) => [...list, item]);
      void process(clientId);
    },
    [commit, conversationId, process],
  );

  const retry = useCallback((clientId: string) => void process(clientId), [process]);
  const cancel = useCallback(
    (clientId: string) => {
      cancelled.current.add(clientId);
      remove(clientId);
    },
    [remove],
  );
  /** Called when a realtime INSERT for one of our client ids arrives first. */
  const resolve = useCallback(
    (clientId: string | null) => {
      if (clientId && itemsRef.current.some((i) => i.clientId === clientId && i.status === "sending")) remove(clientId);
    },
    [remove],
  );

  useEffect(() => {
    const map = handles.current;
    const list = itemsRef;
    return () => {
      map.forEach((hs) => hs.forEach((h) => h.cancel()));
      map.clear();
      list.current.forEach((i) => i.files.forEach((f) => URL.revokeObjectURL(f.previewUrl)));
    };
  }, []);

  return { items, send, retry, cancel, resolve };
}

// ---------------------------------------------------------------------------
// Conversation-level actions (shared by list rows and the info panel)
// ---------------------------------------------------------------------------
export function useConversationActions() {
  const qc = useQueryClient();
  const refresh = (id: string) => {
    void qc.invalidateQueries({ queryKey: qk.conversationsAll });
    void qc.invalidateQueries({ queryKey: qk.conversation(id) });
  };
  const markRead = useMutation({
    mutationFn: (id: string) => api.post(`/api/conversations/${id}/read`),
    onSuccess: (_d, id) => refresh(id),
    meta: { silent: true },
  });
  const mute = useMutation({
    mutationFn: ({ id, until }: { id: string; until: string | null }) => api.post(`/api/conversations/${id}/mute`, { until }),
    onSuccess: (_d, v) => {
      refresh(v.id);
      toast.success(v.until ? "Notifications muted" : "Notifications unmuted");
    },
  });
  const archive = useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) => api.post(`/api/conversations/${id}/archive`, { archived }),
    onSuccess: (_d, v) => {
      refresh(v.id);
      toast.success(v.archived ? "Chat archived" : "Chat moved to inbox");
    },
  });
  const clear = useMutation({
    mutationFn: (id: string) => api.delete(`/api/conversations/${id}`),
    onSuccess: (_d, id) => {
      refresh(id);
      qc.removeQueries({ queryKey: qk.messages(id) });
      toast.success("Conversation deleted");
    },
  });
  return { markRead, mute, archive, clear };
}

export const MUTE_OPTIONS: { label: string; ms: number | null }[] = [
  { label: "For 1 hour", ms: 3_600_000 },
  { label: "For 8 hours", ms: 8 * 3_600_000 },
  { label: "For 1 week", ms: 7 * 24 * 3_600_000 },
  { label: "Until I turn it back on", ms: null },
];

export function muteUntil(ms: number | null): string {
  return ms === null ? FAR_FUTURE : new Date(Date.now() + ms).toISOString();
}

export function isMuted(mutedUntil: string | null | undefined, now: number): boolean {
  return Boolean(mutedUntil && Date.parse(mutedUntil) > now);
}

// ---------------------------------------------------------------------------
// Typing indicators (private broadcast channel, authorized by RLS)
// ---------------------------------------------------------------------------
export function useTyping(conversationId: string, me: { id: string; username: string }) {
  const [typers, setTypers] = useState<Record<string, { username: string; at: number }>>({});
  const channelRef = useRef<RealtimeChannel | null>(null);
  const enabled = useRef(false);
  const lastSent = useRef(0);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    let active = true;
    let channel: RealtimeChannel | null = null;
    const timers = new Map<string, number>();

    void (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (data.session?.access_token) await supabase.realtime.setAuth(data.session.access_token);
      } catch {
        // fall through: the client keeps its own token in sync
      }
      if (!active) return;
      channel = supabase.channel(`conv:${conversationId}`, { config: { private: true, broadcast: { self: false } } });
      channel.on("broadcast", { event: "typing" }, ({ payload }) => {
        const p = payload as { user_id?: string; username?: string; typing?: boolean };
        if (!p.user_id || p.user_id === me.id) return;
        const uid = p.user_id;
        window.clearTimeout(timers.get(uid));
        if (p.typing === false) {
          setTypers((t) => {
            const next = { ...t };
            delete next[uid];
            return next;
          });
          return;
        }
        setTypers((t) => ({ ...t, [uid]: { username: String(p.username ?? ""), at: Date.now() } }));
        timers.set(
          uid,
          window.setTimeout(() => {
            setTypers((t) => {
              const next = { ...t };
              delete next[uid];
              return next;
            });
          }, 4000),
        );
      });
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED") enabled.current = true;
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") enabled.current = false;
      });
      channelRef.current = channel;
    })();

    return () => {
      active = false;
      enabled.current = false;
      timers.forEach((t) => window.clearTimeout(t));
      channelRef.current = null;
      if (channel) void supabase.removeChannel(channel);
      setTypers({});
    };
  }, [conversationId, me.id]);

  const notifyTyping = useCallback(
    (typing = true) => {
      const ch = channelRef.current;
      if (!ch || !enabled.current) return;
      const now = Date.now();
      if (typing && now - lastSent.current < 2000) return;
      lastSent.current = typing ? now : 0;
      void ch.send({ type: "broadcast", event: "typing", payload: { user_id: me.id, username: me.username, typing } }).catch(() => undefined);
    },
    [me.id, me.username],
  );

  return { typers: Object.entries(typers).map(([id, v]) => ({ id, username: v.username })), notifyTyping };
}

export function replyPreviewOf(m: ChatMessage): ReplyPreview {
  return { id: m.id, sender_id: m.sender_id, type: m.type, body: m.body ? m.body.slice(0, 200) : null, deleted: Boolean(m.deleted_at) };
}

export function previewText(type: MessageType | null, body: string | null, deleted?: boolean): string {
  if (deleted) return "Message deleted";
  switch (type) {
    case "image": return "📷 Photo";
    case "video": return "🎬 Video";
    case "voice": return "🎤 Voice message";
    case "gif": return "GIF";
    case "sticker": return "Sticker";
    case "document": return "📄 Document";
    case "location": return "📍 Location";
    case "contact": return "👤 Contact";
    case "call": return "📞 Call";
    case "story_reply": return `↩︎ Story reply${body ? `: ${body}` : ""}`;
    case "link":
    case "text":
    case "system":
      return body ?? "";
    default:
      return body ?? "";
  }
}
