"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, Camera, Info, Pin, Search, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { EmptyState, ErrorState, Skeleton, Spinner } from "@/components/ui/feedback";
import { CallButtons } from "@/components/calls/call-buttons";
import { useMe } from "@/components/providers/session-provider";
import { usePresence } from "@/hooks/use-presence";
import { api, ClientApiError, errorMessage } from "@/lib/api/client";
import { cn, displayName, isOnline, lastSeenLabel, shortTime } from "@/lib/utils";
import type { ChatMessage, ReplyPreview, SearchHit } from "./types";
import { flattenPages, previewText, replyPreviewOf, useConversationActions, useConversationDetail, useMessages, useOutbox, usePinnedMessages, useTyping } from "./use-chat";
import { MessageList } from "./message-list";
import { Composer } from "./composer";
import { InfoPanel } from "./info-panel";

function ConversationSkeleton() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3">
        <Skeleton className="h-10 w-10 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
      <div className="flex-1 space-y-3 p-5">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className={cn("h-10 rounded-3xl", i % 2 ? "ml-auto w-1/2" : "w-2/5")} />
        ))}
      </div>
    </div>
  );
}

function PinnedBar({ conversationId, onJump, senderName }: { conversationId: string; onJump: (id: string) => void; senderName: (id: string | null) => string }) {
  const pinned = usePinnedMessages(conversationId);
  const [index, setIndex] = useState(0);
  const list = pinned.data ?? [];
  if (!list.length) return null;
  const i = index % list.length;
  const m = list[i];
  return (
    <button
      type="button"
      onClick={() => {
        onJump(m.id);
        setIndex(i + 1);
      }}
      className="flex w-full items-center gap-3 border-b border-border bg-surface px-4 py-2 text-left hover:bg-surface-2"
      aria-label={`Pinned message ${i + 1} of ${list.length}. Jump to message`}
    >
      <span className="flex flex-col gap-0.5" aria-hidden>
        {list.slice(0, 4).map((_, j) => (
          <span key={j} className={cn("h-2 w-0.5 rounded-full", j === i % 4 ? "bg-brand" : "bg-border")} />
        ))}
      </span>
      <Pin className="h-4 w-4 shrink-0 text-brand" />
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-bold text-brand">
          Pinned{list.length > 1 ? ` (${i + 1}/${list.length})` : ""} · {senderName(m.sender_id)}
        </span>
        <span className="block truncate text-sm">{previewText(m.type, m.body, Boolean(m.deleted_at)) || "Message"}</span>
      </span>
    </button>
  );
}

function SearchPanel({ conversationId, onPick, onClose }: { conversationId: string; onPick: (id: string) => void; onClose: () => void }) {
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  useEffect(() => {
    const t = window.setTimeout(() => setTerm(q.trim()), 300);
    return () => window.clearTimeout(t);
  }, [q]);
  const results = useQuery({
    queryKey: ["chat-search", conversationId, term],
    enabled: term.length > 0,
    queryFn: () => api.get<SearchHit[]>("/api/messages/search", { q: term, conversationId }),
  });
  return (
    <div className="border-b border-border bg-surface">
      <div className="flex items-center gap-2 px-3 py-2">
        <Search className="h-4 w-4 text-muted" />
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Escape" && onClose()}
          placeholder="Search in this chat"
          aria-label="Search in this chat"
          className="h-9 flex-1 bg-transparent text-sm outline-none"
        />
        <button type="button" onClick={onClose} className="rounded-full p-1.5 text-muted hover:bg-surface-2" aria-label="Close search">
          <X className="h-4 w-4" />
        </button>
      </div>
      {term ? (
        <div className="max-h-64 overflow-y-auto border-t border-border scrollbar-thin">
          {results.isPending ? (
            <div className="flex justify-center py-4">
              <Spinner />
            </div>
          ) : results.isError ? (
            <p className="p-4 text-sm text-danger">{errorMessage(results.error)}</p>
          ) : results.data?.length ? (
            <ul>
              {results.data.map((h) => (
                <li key={h.id}>
                  <button type="button" onClick={() => onPick(h.id)} className="flex w-full items-center gap-3 px-4 py-2 text-left hover:bg-surface-2">
                    <span className="min-w-0 flex-1 truncate text-sm">{h.body}</span>
                    <span className="shrink-0 text-xs text-muted">{shortTime(h.created_at)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-4 text-center text-sm text-muted">No messages found</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

export function ConversationView() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  return <Conversation key={id} id={id} />;
}

function Conversation({ id }: { id: string }) {
  const me = useMe();
  const router = useRouter();
  const searchParams = useSearchParams();
  const meId = me.user.id;
  const detail = useConversationDetail(id);
  const outbox = useOutbox(id);
  const { markRead } = useConversationActions();
  const resolveOutbox = outbox.resolve;
  const onIncoming = useCallback((m: ChatMessage) => {
    if (m.sender_id === meId) resolveOutbox(m.client_id);
  }, [meId, resolveOutbox]);
  const messagesQuery = useMessages(id, onIncoming);
  const { typers, notifyTyping } = useTyping(id, { id: meId, username: me.profile.username });
  const [replyTo, setReplyTo] = useState<ReplyPreview | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const mParam = searchParams.get("m");
  const [highlight, setHighlight] = useState<string | null>(mParam);
  const [prevM, setPrevM] = useState(mParam);
  if (mParam !== prevM) {
    setPrevM(mParam);
    if (mParam) setHighlight(mParam);
  }
  const [searching, setSearching] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const lastMarked = useRef<string | null>(null);

  const messages = useMemo(() => flattenPages(messagesQuery.data), [messagesQuery.data]);
  const data = detail.data;
  const isGroup = data?.conversation.type === "group";
  const other = data?.other ?? null;
  const presence = usePresence([other?.id]);
  const lastSeen = other ? presence.data?.get(other.id) : undefined;
  const members = useMemo(() => data?.members ?? [], [data?.members]);
  const activeMembers = members.filter((m) => !m.left_at);
  const myRole = data?.me.role ?? "member";
  const isAdmin = myRole === "owner" || myRole === "admin";
  const canPin = !isGroup || isAdmin || !data?.group?.only_admins_edit;

  // Mark read when visible and new messages from others arrive.
  const newestOther = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].sender_id !== meId && messages[i].type !== "system") return messages[i].id;
    return null;
  }, [messages, meId]);
  const markReadMutate = markRead.mutate;
  useEffect(() => {
    if (!messagesQuery.isSuccess) return;
    const tryMark = () => {
      if (document.visibilityState !== "visible") return;
      const key = newestOther ?? "none";
      if (lastMarked.current === key) return;
      lastMarked.current = key;
      markReadMutate(id);
    };
    const t = window.setTimeout(tryMark, 500);
    document.addEventListener("visibilitychange", tryMark);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("visibilitychange", tryMark);
    };
  }, [id, newestOther, messagesQuery.isSuccess, markReadMutate]);

  const fetchNext = messagesQuery.fetchNextPage;
  const loadMore = useCallback(() => void fetchNext(), [fetchNext]);
  const clearHighlight = useCallback(() => setHighlight(null), []);
  const senderName = useCallback(
    (uid: string | null) => (uid === meId ? "You" : displayName(members.find((m) => m.user_id === uid)?.profile)),
    [members, meId],
  );

  if (detail.isPending) return <ConversationSkeleton />;
  if (detail.isError || !data) {
    const notFound = detail.error instanceof ClientApiError && detail.error.status === 404;
    return (
      <div className="flex h-full flex-col items-center justify-center">
        {notFound ? (
          <EmptyState title="Chat not found" description="This conversation doesn't exist or you're no longer a member." action={<Link href="/chats" className="font-bold text-brand">Back to chats</Link>} />
        ) : (
          <ErrorState description={errorMessage(detail.error)} onRetry={() => void detail.refetch()} />
        )}
      </div>
    );
  }

  const title = isGroup ? data.group?.name ?? "Group" : displayName(other);
  const avatarId = isGroup ? data.group?.avatar_media_id : other?.avatar_media_id;
  const typingLabel = typers.length
    ? isGroup
      ? `${typers.map((t) => t.username || "Someone").slice(0, 2).join(", ")} ${typers.length > 1 ? "are" : "is"} typing…`
      : "typing…"
    : null;
  const subtitle = typingLabel ?? (isGroup ? `${activeMembers.length} members` : lastSeenLabel(lastSeen) ?? (other ? `@${other.username}` : ""));

  let disabledReason: string | null = null;
  if (!isGroup && data.blocked) disabledReason = "You blocked this user. Unblock them from chat info to send messages.";
  else if (!isGroup && !other) disabledReason = "This account is no longer available.";
  else if (isGroup && data.group?.only_admins_send && myRole === "member") disabledReason = "Only admins can send messages in this group.";

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-2 border-b border-border bg-surface/90 px-2 py-2 backdrop-blur md:px-4">
          <Link href="/chats" className="rounded-full p-2 text-ink-2 hover:bg-surface-2 md:hidden" aria-label="Back to chats">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <button type="button" onClick={() => setInfoOpen(true)} className="flex min-w-0 flex-1 items-center gap-3 rounded-2xl p-1 text-left hover:bg-surface-2" aria-label={`${title}, open chat info`}>
            <Avatar mediaId={avatarId} name={title} size="md" online={!isGroup && isOnline(lastSeen)} />
            <span className="min-w-0">
              <span className="block truncate font-display text-base font-bold">{title}</span>
              <span className={cn("block truncate text-xs", typingLabel ? "font-semibold text-brand" : "text-muted")} aria-live="polite">
                {subtitle}
              </span>
            </span>
          </button>
          <div className="flex shrink-0 items-center gap-0.5">
            <CallButtons conversationId={id} compact />
            {!isGroup && other ? (
              <Link href={`/camera?to=${other.id}`} className="rounded-full p-2.5 text-ink-2 hover:bg-surface-2" aria-label={`Send a Snap to ${title}`}>
                <Camera className="h-5 w-5" />
              </Link>
            ) : null}
            <button type="button" onClick={() => setSearching((s) => !s)} className={cn("rounded-full p-2.5 text-ink-2 hover:bg-surface-2", searching && "bg-brand-soft text-brand")} aria-label="Search in chat" aria-pressed={searching}>
              <Search className="h-5 w-5" />
            </button>
            <button type="button" onClick={() => setInfoOpen((o) => !o)} className={cn("rounded-full p-2.5 text-ink-2 hover:bg-surface-2", infoOpen && "bg-brand-soft text-brand")} aria-label="Chat info" aria-pressed={infoOpen}>
              <Info className="h-5 w-5" />
            </button>
          </div>
        </header>
        {searching ? (
          <SearchPanel
            conversationId={id}
            onClose={() => setSearching(false)}
            onPick={(mid) => {
              setHighlight(mid);
              setSearching(false);
            }}
          />
        ) : null}
        <PinnedBar conversationId={id} onJump={setHighlight} senderName={senderName} />
        {data.conversation.disappear_mode !== "off" ? (
          <p className="bg-brand-soft px-4 py-1 text-center text-[11px] font-semibold text-brand">
            Messages disappear {data.conversation.disappear_mode === "24h" ? "24 hours" : "7 days"} after they&apos;re sent
          </p>
        ) : null}

        {messagesQuery.isPending ? (
          <div className="flex flex-1 items-center justify-center">
            <Spinner label="Loading messages" />
          </div>
        ) : messagesQuery.isError ? (
          <ErrorState className="flex-1" description={errorMessage(messagesQuery.error)} onRetry={() => void messagesQuery.refetch()} />
        ) : messages.length === 0 && outbox.items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center">
            <EmptyState
              title="Say hi 👋"
              description={isGroup ? "Start the conversation with your group." : `This is the start of your chat with ${title}.`}
              action={<Avatar mediaId={avatarId} name={title} size="xl" />}
            />
          </div>
        ) : (
          <MessageList
            conversationId={id}
            meId={meId}
            messages={messages}
            outbox={outbox.items}
            members={members}
            isGroup={isGroup}
            canPin={canPin}
            isAdmin={isAdmin}
            hasMore={Boolean(messagesQuery.hasNextPage)}
            loadingMore={messagesQuery.isFetchingNextPage}
            onLoadMore={loadMore}
            highlightId={highlight}
            onHighlightDone={clearHighlight}
            onReply={(m) => {
              setEditing(null);
              setReplyTo(replyPreviewOf(m));
            }}
            onEdit={(m) => {
              setReplyTo(null);
              setEditing(m);
            }}
            onRetry={outbox.retry}
            onCancel={outbox.cancel}
            onJumpRequest={setHighlight}
          />
        )}
        <AnimatePresence>
          {typingLabel ? (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="px-5 pb-1 text-xs font-semibold text-muted">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1">
                <span className="flex gap-0.5" aria-hidden>
                  {[0, 1, 2].map((d) => (
                    <span key={d} className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted" style={{ animationDelay: `${d * 120}ms` }} />
                  ))}
                </span>
                {typingLabel}
              </span>
            </motion.div>
          ) : null}
        </AnimatePresence>
        <Composer
          conversationId={id}
          replyTo={replyTo}
          replyLabel={replyTo ? senderName(replyTo.sender_id) : null}
          onCancelReply={() => setReplyTo(null)}
          editing={editing}
          onCancelEdit={() => setEditing(null)}
          onSend={outbox.send}
          onTyping={notifyTyping}
          disabledReason={disabledReason}
        />
      </div>
      <InfoPanel
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
        detail={data}
        meId={meId}
        onJump={(mid) => {
          setHighlight(mid);
          setInfoOpen(false);
        }}
        onLeft={() => router.replace("/chats")}
      />
    </div>
  );
}
