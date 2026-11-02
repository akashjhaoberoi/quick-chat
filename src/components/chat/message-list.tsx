"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import {
  AlertCircle, ArrowDown, Check, CheckCheck, Clock, Copy, CornerUpLeft, Flag, Forward, MoreHorizontal, Pencil, Pin, PinOff,
  Plus, RotateCcw, SmilePlus, Star, StarOff, Trash2, X,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/feedback";
import { useConfirm } from "@/components/ui/confirm";
import { ReportDialog } from "@/components/moderation/report-dialog";
import { useConversations } from "@/hooks/use-badges";
import { api } from "@/lib/api/client";
import { qk } from "@/lib/query-keys";
import { cn, dayLabel, displayName } from "@/lib/utils";
import type { ConversationMember } from "@/types/models";
import type { ChatMessage, DeliveryStatus, MemberWithProfile } from "./types";
import { deliveryStatus, patchMessage, previewText, type OutboxItem } from "./use-chat";
import { isBubbleless, MessageContent } from "./message-content";
import { EmojiPicker, QUICK_REACTIONS } from "./emoji-picker";

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------
function useMessageMutations(conversationId: string, meId: string) {
  const qc = useQueryClient();
  const react = useMutation({
    mutationFn: ({ id, emoji }: { id: string; emoji: string | null }) => api.post(`/api/messages/${id}/reactions`, { emoji }),
    onMutate: ({ id, emoji }) => {
      patchMessage(qc, conversationId, id, (m) => {
        const mine = m.reactions.find((r) => r.user_id === meId);
        const others = m.reactions.filter((r) => r.user_id !== meId);
        const toggledOff = emoji === null || mine?.emoji === emoji;
        return { ...m, reactions: toggledOff ? others : [...others, { user_id: meId, emoji: emoji! }] };
      });
    },
    onError: () => void qc.invalidateQueries({ queryKey: qk.messages(conversationId) }),
  });
  const star = useMutation({
    mutationFn: ({ id, starred }: { id: string; starred: boolean }) => api.post(`/api/messages/${id}/star`, { starred }),
    onMutate: ({ id, starred }) => patchMessage(qc, conversationId, id, (m) => ({ ...m, starred })),
    onSuccess: (_d, v) => {
      toast.success(v.starred ? "Starred" : "Removed from starred");
      void qc.invalidateQueries({ queryKey: ["starred"] });
    },
    onError: () => void qc.invalidateQueries({ queryKey: qk.messages(conversationId) }),
  });
  const pin = useMutation({
    mutationFn: ({ id, pinned }: { id: string; pinned: boolean }) => api.post(`/api/messages/${id}/pin`, { pinned }),
    onSuccess: (_d, v) => {
      patchMessage(qc, conversationId, v.id, (m) => ({ ...m, pinned_at: v.pinned ? new Date().toISOString() : null }));
      void qc.invalidateQueries({ queryKey: ["pinned", conversationId] });
      toast.success(v.pinned ? "Message pinned" : "Message unpinned");
    },
  });
  const remove = useMutation({
    mutationFn: ({ id, scope }: { id: string; scope: "me" | "everyone" }) => api.delete(`/api/messages/${id}?scope=${scope}`),
    onSuccess: (_d, v) => {
      if (v.scope === "me") patchMessage(qc, conversationId, v.id, () => null);
      else
        patchMessage(qc, conversationId, v.id, (m) => ({ ...m, deleted_at: new Date().toISOString(), body: null, metadata: {}, attachments: [], reactions: [], pinned_at: null }));
      void qc.invalidateQueries({ queryKey: qk.conversationsAll });
      void qc.invalidateQueries({ queryKey: ["pinned", conversationId] });
    },
  });
  return { react, star, pin, remove };
}

// ---------------------------------------------------------------------------
// Receipts
// ---------------------------------------------------------------------------
export function StatusIcon({ status }: { status: DeliveryStatus }) {
  const label = { sending: "Sending", failed: "Failed to send", sent: "Sent", delivered: "Delivered", read: "Read" }[status];
  const cls = "h-3.5 w-3.5";
  return (
    <span title={label} aria-label={label} role="img" className="inline-flex">
      {status === "sending" ? <Clock className={cls} /> : null}
      {status === "failed" ? <AlertCircle className={cn(cls, "text-danger")} /> : null}
      {status === "sent" ? <Check className={cls} /> : null}
      {status === "delivered" ? <CheckCheck className={cls} /> : null}
      {status === "read" ? <CheckCheck className={cn(cls, "text-sky-300")} /> : null}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------
type RowProps = {
  message: ChatMessage;
  mine: boolean;
  sender: MemberWithProfile | undefined;
  replySender: string | null;
  showHeader: boolean;
  showAvatar: boolean;
  isGroup: boolean;
  status: DeliveryStatus | null;
  meId: string;
  highlighted: boolean;
  outbox?: OutboxItem;
  onOpenMenu: (m: ChatMessage, at: { x: number; y: number } | null, sheet: boolean) => void;
  onReact: (id: string, emoji: string) => void;
  onJump: (id: string) => void;
  onRetry: (clientId: string) => void;
  onCancel: (clientId: string) => void;
};

const MessageRow = memo(function MessageRow({
  message, mine, sender, replySender, showHeader, showAvatar, isGroup, status, meId, highlighted, outbox, onOpenMenu, onReact, onJump, onRetry, onCancel,
}: RowProps) {
  const pressTimer = useRef<number | null>(null);
  const deleted = Boolean(message.deleted_at);
  const bubbleless = !deleted && isBubbleless(message);
  const time = new Date(message.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const name = displayName(sender?.profile);

  const grouped = useMemo(() => {
    const map = new Map<string, { count: number; mine: boolean }>();
    for (const r of message.reactions) {
      const e = map.get(r.emoji) ?? { count: 0, mine: false };
      e.count++;
      if (r.user_id === meId) e.mine = true;
      map.set(r.emoji, e);
    }
    return Array.from(map.entries());
  }, [message.reactions, meId]);

  const cancelPress = () => {
    if (pressTimer.current) window.clearTimeout(pressTimer.current);
    pressTimer.current = null;
  };
  const interactive = !outbox;

  return (
    <div
      id={`msg-${message.id}`}
      className={cn("group/row flex w-full gap-2 px-3 md:px-5", mine ? "justify-end" : "justify-start", showHeader ? "mt-3" : "mt-0.5")}
    >
      {!mine && isGroup ? (
        <span className="w-8 shrink-0 self-end">
          {showAvatar ? <Avatar mediaId={sender?.profile?.avatar_media_id} name={name} size="sm" /> : null}
        </span>
      ) : null}
      <div className={cn("flex min-w-0 max-w-[78%] flex-col md:max-w-[65%]", mine ? "items-end" : "items-start")}>
        {showHeader && isGroup && !mine ? <span className="mb-0.5 ml-3 text-xs font-bold text-brand">{name}</span> : null}
        <div className={cn("relative flex items-center gap-1", mine ? "flex-row-reverse" : "flex-row")}>
          <div
            tabIndex={interactive ? 0 : -1}
            role={interactive ? "button" : undefined}
            aria-haspopup={interactive ? "menu" : undefined}
            aria-label={interactive ? `Message from ${mine ? "you" : name} at ${time}. Press Enter for actions.` : undefined}
            onContextMenu={(e) => {
              if (!interactive) return;
              e.preventDefault();
              onOpenMenu(message, { x: e.clientX, y: e.clientY }, false);
            }}
            onKeyDown={(e) => {
              if (!interactive) return;
              if (e.key === "Enter" || e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
                e.preventDefault();
                const r = e.currentTarget.getBoundingClientRect();
                onOpenMenu(message, { x: r.left + r.width / 2, y: r.bottom }, false);
              }
            }}
            onTouchStart={(e) => {
              if (!interactive) return;
              const t = e.touches[0];
              cancelPress();
              pressTimer.current = window.setTimeout(() => {
                onOpenMenu(message, { x: t.clientX, y: t.clientY }, true);
                navigator.vibrate?.(10);
              }, 450);
            }}
            onTouchEnd={cancelPress}
            onTouchMove={cancelPress}
            className={cn(
              "relative min-w-0 select-text outline-none transition-shadow focus-visible:ring-4 focus-visible:ring-[var(--ring)]",
              bubbleless
                ? "rounded-2xl"
                : cn(
                    "rounded-3xl px-3.5 py-2 shadow-sm",
                    mine ? "text-white" : "border border-border bg-[var(--bubble-them)] text-ink",
                    mine ? (showHeader ? "rounded-br-lg" : "rounded-r-lg") : showHeader ? "rounded-bl-lg" : "rounded-l-lg",
                  ),
              highlighted && "ring-4 ring-accent/60",
              outbox?.status === "failed" && "opacity-80",
            )}
            style={mine && !bubbleless ? { background: "var(--bubble-me)" } : undefined}
          >
            {message.forwarded && !deleted ? (
              <span className={cn("mb-0.5 flex items-center gap-1 text-[11px] italic", mine ? "text-white/80" : "text-muted")}>
                <Forward className="h-3 w-3" /> Forwarded
              </span>
            ) : null}
            {message.reply_to && !deleted ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onJump(message.reply_to!.id);
                }}
                className={cn("mb-1.5 block w-full rounded-xl border-l-4 px-2.5 py-1.5 text-left text-xs", mine ? "border-white/70 bg-white/15" : "border-brand bg-surface-2")}
              >
                <span className={cn("block font-bold", mine ? "text-white" : "text-brand")}>{replySender ?? "Message"}</span>
                <span className={cn("line-clamp-2 block", mine ? "text-white/85" : "text-muted")}>
                  {previewText(message.reply_to.type, message.reply_to.body, message.reply_to.deleted) || "Message"}
                </span>
              </button>
            ) : null}
            {deleted ? (
              <p className={cn("text-sm italic", mine ? "text-white/80" : "text-muted")}>This message was deleted</p>
            ) : (
              <MessageContent message={message} mine={mine} files={outbox?.files} />
            )}
            <span
              className={cn(
                "mt-0.5 flex items-center justify-end gap-1 text-[10.5px] tabular-nums",
                bubbleless ? "rounded-full bg-black/40 px-1.5 text-white" : mine ? "text-white/75" : "text-muted",
                bubbleless && "absolute bottom-1.5 right-1.5",
              )}
            >
              {message.starred ? <Star className="h-3 w-3" fill="currentColor" aria-label="Starred" /> : null}
              {message.pinned_at ? <Pin className="h-3 w-3" aria-label="Pinned" /> : null}
              {message.edited_at && !deleted ? <span>edited</span> : null}
              {message.expires_at ? <Clock className="h-3 w-3" aria-label="Disappearing message" /> : null}
              <time dateTime={message.created_at}>{time}</time>
              {status ? <StatusIcon status={status} /> : null}
            </span>
          </div>
          {interactive && !deleted ? (
            <div className="hidden items-center gap-0.5 opacity-0 transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100 md:flex">
              <button
                type="button"
                aria-label="React"
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  onOpenMenu(message, { x: r.left, y: r.bottom }, false);
                }}
                className="rounded-full p-1.5 text-muted hover:bg-surface-2 hover:text-ink"
              >
                <SmilePlus className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="Message actions"
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  onOpenMenu(message, { x: r.left, y: r.bottom }, false);
                }}
                className="rounded-full p-1.5 text-muted hover:bg-surface-2 hover:text-ink"
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </div>
          ) : null}
        </div>
        {grouped.length ? (
          <div className={cn("-mt-1.5 flex flex-wrap gap-1", mine ? "mr-2 justify-end" : "ml-2")}>
            {grouped.map(([emoji, info]) => (
              <button
                key={emoji}
                type="button"
                onClick={() => onReact(message.id, emoji)}
                aria-pressed={info.mine}
                aria-label={`${emoji} ${info.count}${info.mine ? ", including you" : ""}`}
                className={cn(
                  "relative z-[1] flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-xs shadow-sm",
                  info.mine ? "border-brand bg-brand-soft" : "border-border bg-surface",
                )}
              >
                <span>{emoji}</span>
                {info.count > 1 ? <span className="font-bold text-ink-2">{info.count}</span> : null}
              </button>
            ))}
          </div>
        ) : null}
        {outbox?.status === "failed" ? (
          <div className="mt-1 flex items-center gap-2 text-xs">
            <span className="text-danger">{outbox.error ?? "Not sent"}</span>
            <button type="button" onClick={() => onRetry(outbox.clientId)} className="inline-flex items-center gap-1 font-bold text-brand">
              <RotateCcw className="h-3 w-3" /> Retry
            </button>
            <button type="button" onClick={() => onCancel(outbox.clientId)} className="inline-flex items-center gap-1 font-bold text-muted">
              <Trash2 className="h-3 w-3" /> Delete
            </button>
          </div>
        ) : outbox?.status === "uploading" ? (
          <button type="button" onClick={() => onCancel(outbox.clientId)} className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-muted hover:text-ink">
            <X className="h-3 w-3" /> Cancel upload
          </button>
        ) : null}
      </div>
    </div>
  );
});

// ---------------------------------------------------------------------------
// Action menu (popover on desktop, sheet on touch)
// ---------------------------------------------------------------------------
type MenuState = { message: ChatMessage; x: number; y: number; sheet: boolean; openedAt: number };

type Action = { label: string; icon: ReactNode; onSelect: () => void; danger?: boolean };

function ActionMenu({ state, actions, onReact, myReaction, onClose }: { state: MenuState; actions: Action[]; onReact: (emoji: string) => void; myReaction: string | null; onClose: () => void }) {
  const [picker, setPicker] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (state.sheet || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    const left = Math.min(Math.max(8, state.x - r.width / 2), window.innerWidth - r.width - 8);
    const top = state.y + r.height + 8 > window.innerHeight ? Math.max(8, state.y - r.height - 8) : state.y + 4;
    setPos({ left, top });
  }, [state, picker]);

  useEffect(() => {
    if (state.sheet) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    const t = window.setTimeout(() => ref.current?.querySelector<HTMLElement>("button")?.focus(), 20);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
      window.clearTimeout(t);
    };
  }, [state.sheet, onClose]);

  const body = (
    <>
      <div className="flex items-center gap-1 border-b border-border p-1.5">
        {QUICK_REACTIONS.map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => onReact(e)}
            aria-label={`React ${e}`}
            aria-pressed={myReaction === e}
            className={cn("rounded-full p-1.5 text-2xl leading-none transition-transform hover:scale-125", myReaction === e && "bg-brand-soft")}
          >
            {e}
          </button>
        ))}
        <button type="button" onClick={() => setPicker((p) => !p)} aria-label="More reactions" className="rounded-full p-2 text-muted hover:bg-surface-2">
          <Plus className="h-5 w-5" />
        </button>
      </div>
      {picker ? (
        <div className="w-full p-1 sm:w-80">
          <EmojiPicker onSelect={onReact} />
        </div>
      ) : (
        <div role="menu" className="p-1">
          {actions.map((a) => (
            <button
              key={a.label}
              type="button"
              role="menuitem"
              onClick={() => {
                onClose();
                a.onSelect();
              }}
              className={cn("flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium hover:bg-surface-2 [&>svg]:h-4 [&>svg]:w-4", a.danger ? "text-danger" : "text-ink")}
            >
              {a.icon}
              {a.label}
            </button>
          ))}
        </div>
      )}
    </>
  );

  if (state.sheet) {
    return (
      <Dialog open onClose={onClose} variant="sheet" title="Message" hideClose>
        <div className="-mx-2">{body}</div>
      </Dialog>
    );
  }
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.12 }}
      className="fixed z-[90] w-72 overflow-hidden rounded-2xl border border-border bg-surface shadow-[var(--shadow-pop)]"
      style={{ left: pos?.left ?? state.x, top: pos?.top ?? state.y, visibility: pos ? "visible" : "hidden" }}
    >
      {body}
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Forward
// ---------------------------------------------------------------------------
export function ForwardDialog({ message, onClose }: { message: ChatMessage; onClose: () => void }) {
  const conversations = useConversations(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const qc = useQueryClient();
  const forward = useMutation({
    mutationFn: () => api.post<{ count: number }>(`/api/messages/${message.id}/forward`, { conversationIds: selected }),
    onSuccess: (r) => {
      toast.success(`Forwarded to ${r.count} chat${r.count === 1 ? "" : "s"}`);
      void qc.invalidateQueries({ queryKey: qk.conversationsAll });
      onClose();
    },
  });
  const list = (conversations.data ?? []).filter((c) => !q.trim() || c.title.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <Dialog
      open
      onClose={onClose}
      variant="sheet"
      title="Forward message"
      description="Choose up to 5 chats."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!selected.length} loading={forward.isPending} onClick={() => forward.mutate()}>
            Forward{selected.length ? ` (${selected.length})` : ""}
          </Button>
        </>
      }
    >
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search chats"
        aria-label="Search chats"
        className="mb-2 h-10 w-full rounded-xl border border-border bg-surface-2 px-3 text-sm focus:border-brand focus:outline-none"
      />
      {conversations.isPending ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : (
        <ul className="space-y-0.5" role="listbox" aria-multiselectable="true" aria-label="Chats">
          {list.map((c) => {
            const on = selected.includes(c.conversation_id);
            return (
              <li key={c.conversation_id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={on}
                  disabled={!on && selected.length >= 5}
                  onClick={() => setSelected(on ? selected.filter((x) => x !== c.conversation_id) : [...selected, c.conversation_id])}
                  className={cn("flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left hover:bg-surface-2 disabled:opacity-50", on && "bg-brand-soft")}
                >
                  <Avatar mediaId={c.avatar_media_id} name={c.title} size="md" />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{c.title}</span>
                  <span className={cn("flex h-6 w-6 items-center justify-center rounded-full border-2", on ? "border-brand bg-brand text-white" : "border-border")}>
                    {on ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
                  </span>
                </button>
              </li>
            );
          })}
          {list.length === 0 ? <li className="py-6 text-center text-sm text-muted">No chats found</li> : null}
        </ul>
      )}
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------
export type MessageListProps = {
  conversationId: string;
  meId: string;
  messages: ChatMessage[];
  outbox: OutboxItem[];
  members: MemberWithProfile[];
  isGroup: boolean;
  canPin: boolean;
  isAdmin: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  highlightId: string | null;
  onHighlightDone: () => void;
  onReply: (m: ChatMessage) => void;
  onEdit: (m: ChatMessage) => void;
  onRetry: (clientId: string) => void;
  onCancel: (clientId: string) => void;
  onJumpRequest: (id: string) => void;
};

function sameDay(a: string, b: string) {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

export function MessageList(props: MessageListProps) {
  const { conversationId, meId, messages, outbox, members, isGroup, canPin, isAdmin, hasMore, loadingMore, onLoadMore, highlightId, onHighlightDone } = props;
  const scroller = useRef<HTMLDivElement>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const prevFirst = useRef<string | null>(null);
  const prevLast = useRef<string | null>(null);
  const prevHeight = useRef(0);
  const loadAttempts = useRef(0);
  const [newCount, setNewCount] = useState(0);
  const [showJump, setShowJump] = useState(false);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [forwarding, setForwarding] = useState<ChatMessage | null>(null);
  const [reporting, setReporting] = useState<ChatMessage | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const confirm = useConfirm();
  const { react, star, pin, remove } = useMessageMutations(conversationId, meId);

  const memberMap = useMemo(() => new Map(members.map((m) => [m.user_id, m])), [members]);
  const memberRows = useMemo<ConversationMember[]>(() => members, [members]);

  const rows = useMemo(() => {
    const local: ChatMessage[] = outbox.map((o) => ({
      id: `local-${o.clientId}`,
      conversation_id: conversationId,
      sender_id: meId,
      type: o.type,
      body: o.body ?? null,
      metadata: o.metadata ?? {},
      reply_to_id: o.replyTo?.id ?? null,
      forwarded: false,
      client_id: o.clientId,
      edited_at: null,
      deleted_at: null,
      expires_at: null,
      pinned_at: null,
      pinned_by: null,
      created_at: o.createdAt,
      attachments: [],
      reactions: [],
      starred: false,
      reply_to: o.replyTo,
    }));
    return [...messages, ...local];
  }, [messages, outbox, conversationId, meId]);
  const outboxMap = useMemo(() => new Map(outbox.map((o) => [`local-${o.clientId}`, o])), [outbox]);

  const scrollToBottom = useCallback((smooth = false) => {
    const el = scroller.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
  }, []);

  // Keep position when older pages are prepended; stick to bottom for new ones.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const first = rows[0]?.id ?? null;
    const last = rows[rows.length - 1]?.id ?? null;
    if (prevFirst.current === null && first) {
      el.scrollTop = el.scrollHeight;
    } else if (first !== prevFirst.current && last === prevLast.current) {
      el.scrollTop = el.scrollHeight - prevHeight.current + el.scrollTop;
    } else if (last !== prevLast.current) {
      const lastRow = rows[rows.length - 1];
      if (atBottom.current || lastRow?.sender_id === meId) el.scrollTop = el.scrollHeight;
      else if (lastRow && lastRow.type !== "system") window.setTimeout(() => setNewCount((c) => c + 1), 0);
    }
    prevFirst.current = first;
    prevLast.current = last;
    prevHeight.current = el.scrollHeight;
  }, [rows, meId]);

  // Infinite scroll upward.
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !loadingMore) {
          prevHeight.current = scroller.current?.scrollHeight ?? 0;
          onLoadMore();
        }
      },
      { root: scroller.current, rootMargin: "300px 0px 0px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loadingMore, onLoadMore]);

  // ?m= / reply / search jumps: load older pages until the message is found.
  useEffect(() => {
    if (!highlightId) return;
    const el = document.getElementById(`msg-${highlightId}`);
    if (el) {
      loadAttempts.current = 0;
      el.scrollIntoView({ block: "center", behavior: "smooth" });
      const t1 = window.setTimeout(() => setFlash(highlightId), 0);
      const t2 = window.setTimeout(() => {
        setFlash(null);
        onHighlightDone();
      }, 2200);
      return () => {
        window.clearTimeout(t1);
        window.clearTimeout(t2);
      };
    }
    if (hasMore && !loadingMore && loadAttempts.current < 15) {
      loadAttempts.current++;
      prevHeight.current = scroller.current?.scrollHeight ?? 0;
      onLoadMore();
    } else if (!hasMore || loadAttempts.current >= 15) {
      loadAttempts.current = 0;
      const t = window.setTimeout(() => {
        toast.message("That message is no longer available.");
        onHighlightDone();
      }, 0);
      return () => window.clearTimeout(t);
    }
  }, [highlightId, rows, hasMore, loadingMore, onLoadMore, onHighlightDone]);

  const onScroll = () => {
    const el = scroller.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    atBottom.current = near;
    setShowJump(!near);
    if (near) setNewCount(0);
  };

  const openMenu = useCallback((m: ChatMessage, at: { x: number; y: number } | null, sheet: boolean) => {
    setMenu({ message: m, x: at?.x ?? window.innerWidth / 2, y: at?.y ?? window.innerHeight / 2, sheet, openedAt: Date.now() });
  }, []);
  const onReact = useCallback((id: string, emoji: string) => react.mutate({ id, emoji }), [react]);
  const closeMenu = useCallback(() => setMenu(null), []);

  const actionsFor = (state: MenuState): Action[] => {
    const m = state.message;
    const mine = m.sender_id === meId;
    const deleted = Boolean(m.deleted_at);
    const list: Action[] = [];
    if (deleted) {
      list.push({ label: "Delete for me", icon: <Trash2 />, danger: true, onSelect: () => remove.mutate({ id: m.id, scope: "me" }) });
      return list;
    }
    if (m.type !== "system") list.push({ label: "Reply", icon: <CornerUpLeft />, onSelect: () => props.onReply(m) });
    if (!["system", "call", "story_reply"].includes(m.type)) list.push({ label: "Forward", icon: <Forward />, onSelect: () => setForwarding(m) });
    if (m.body) {
      list.push({
        label: "Copy text",
        icon: <Copy />,
        onSelect: () =>
          navigator.clipboard.writeText(m.body!).then(
            () => toast.success("Copied"),
            () => toast.error("Couldn't copy"),
          ),
      });
    }
    if (mine && (m.type === "text" || m.type === "link") && state.openedAt - Date.parse(m.created_at) < 15 * 60_000) {
      list.push({ label: "Edit", icon: <Pencil />, onSelect: () => props.onEdit(m) });
    }
    if (canPin && m.type !== "system") {
      list.push({
        label: m.pinned_at ? "Unpin" : "Pin",
        icon: m.pinned_at ? <PinOff /> : <Pin />,
        onSelect: () => pin.mutate({ id: m.id, pinned: !m.pinned_at }),
      });
    }
    if (m.type !== "system") {
      list.push({
        label: m.starred ? "Unstar" : "Star",
        icon: m.starred ? <StarOff /> : <Star />,
        onSelect: () => star.mutate({ id: m.id, starred: !m.starred }),
      });
    }
    if (!mine && m.type !== "system" && m.sender_id) list.push({ label: "Report", icon: <Flag />, danger: true, onSelect: () => setReporting(m) });
    list.push({
      label: "Delete for me",
      icon: <Trash2 />,
      danger: true,
      onSelect: () => remove.mutate({ id: m.id, scope: "me" }),
    });
    if (m.type !== "system" && (mine || (isGroup && isAdmin))) {
      list.push({
        label: "Delete for everyone",
        icon: <Trash2 />,
        danger: true,
        onSelect: async () => {
          if (await confirm({ title: "Delete for everyone?", description: "This message will be removed for everyone in the chat.", confirmLabel: "Delete", danger: true })) {
            remove.mutate({ id: m.id, scope: "everyone" });
          }
        },
      });
    }
    return list;
  };

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={scroller} onScroll={onScroll} className="h-full overflow-y-auto overscroll-contain pb-3 scrollbar-thin" role="log" aria-live="polite" aria-relevant="additions" aria-label="Messages">
        <div ref={sentinel} aria-hidden className="h-1" />
        {loadingMore ? (
          <div className="flex justify-center py-3">
            <Spinner label="Loading older messages" />
          </div>
        ) : !hasMore && rows.length > 0 ? (
          <p className="py-4 text-center text-xs text-muted">This is the beginning of your conversation.</p>
        ) : null}
        {rows.map((m, i) => {
          const prev = rows[i - 1];
          const newDay = !prev || !sameDay(prev.created_at, m.created_at);
          const separator = newDay ? (
            <div className="my-4 flex justify-center" role="separator">
              <span className="rounded-full bg-surface-2 px-3 py-1 text-[11px] font-bold text-muted">{dayLabel(m.created_at)}</span>
            </div>
          ) : null;
          if (m.type === "system") {
            const actor = m.sender_id === meId ? "You" : `@${memberMap.get(m.sender_id ?? "")?.profile?.username ?? "someone"}`;
            return (
              <div key={m.id} id={`msg-${m.id}`}>
                {separator}
                <p className="mx-auto my-2 max-w-[85%] text-center text-xs text-muted">
                  <span className="rounded-full bg-surface-2 px-3 py-1">
                    {actor} {m.body}
                  </span>
                </p>
              </div>
            );
          }
          const grouped = !newDay && prev && prev.type !== "system" && prev.sender_id === m.sender_id && Date.parse(m.created_at) - Date.parse(prev.created_at) < 5 * 60_000;
          const next = rows[i + 1];
          const lastOfGroup = !next || next.type === "system" || next.sender_id !== m.sender_id || !sameDay(m.created_at, next.created_at) || Date.parse(next.created_at) - Date.parse(m.created_at) >= 5 * 60_000;
          const ob = outboxMap.get(m.id);
          const mine = m.sender_id === meId;
          const status: DeliveryStatus | null = !mine ? null : ob ? (ob.status === "failed" ? "failed" : "sending") : deliveryStatus(m, memberRows, meId);
          const replySenderId = m.reply_to?.sender_id;
          const replySender = replySenderId ? (replySenderId === meId ? "You" : displayName(memberMap.get(replySenderId)?.profile)) : null;
          return (
            <div key={m.id}>
              {separator}
              <MessageRow
                message={m}
                mine={mine}
                sender={memberMap.get(m.sender_id ?? "")}
                replySender={replySender}
                showHeader={!grouped}
                showAvatar={lastOfGroup}
                isGroup={isGroup}
                status={status}
                meId={meId}
                highlighted={flash === m.id}
                outbox={ob}
                onOpenMenu={openMenu}
                onReact={onReact}
                onJump={props.onJumpRequest}
                onRetry={props.onRetry}
                onCancel={props.onCancel}
              />
            </div>
          );
        })}
      </div>

      <AnimatePresence>
        {showJump ? (
          <motion.button
            type="button"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            onClick={() => {
              scrollToBottom(true);
              setNewCount(0);
            }}
            className="absolute bottom-4 right-4 flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-2 text-sm font-bold shadow-[var(--shadow-pop)]"
            aria-label={newCount ? `${newCount} new messages, jump to latest` : "Jump to latest"}
          >
            {newCount ? <span className="rounded-full bg-accent px-1.5 text-xs text-white">{newCount}</span> : null}
            <ArrowDown className="h-4 w-4" />
          </motion.button>
        ) : null}
      </AnimatePresence>

      {menu ? (
        <ActionMenu
          state={menu}
          actions={actionsFor(menu)}
          myReaction={menu.message.reactions.find((r) => r.user_id === meId)?.emoji ?? null}
          onReact={(emoji) => {
            if (!menu.message.deleted_at) react.mutate({ id: menu.message.id, emoji });
            setMenu(null);
          }}
          onClose={closeMenu}
        />
      ) : null}
      {forwarding ? <ForwardDialog message={forwarding} onClose={() => setForwarding(null)} /> : null}
      {reporting ? <ReportDialog open onClose={() => setReporting(null)} targetType="message" targetId={reporting.id} targetLabel="message" /> : null}
    </div>
  );
}
