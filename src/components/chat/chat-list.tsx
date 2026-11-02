"use client";

import { memo, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Archive, ArchiveRestore, Bell, BellOff, Camera, CheckCheck, MessageCirclePlus, MessageSquareDashed, MoreHorizontal, Search, Star, Trash2, Users,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Menu, Tabs, type MenuItem } from "@/components/ui/controls";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/ui/feedback";
import { useConfirm } from "@/components/ui/confirm";
import { FriendPicker, useFriends } from "@/components/social/friend-picker";
import { useMe } from "@/components/providers/session-provider";
import { useConversations } from "@/hooks/use-badges";
import { usePresence } from "@/hooks/use-presence";
import { useAppConfig } from "@/hooks/use-app-config";
import { api, errorMessage } from "@/lib/api/client";
import { qk } from "@/lib/query-keys";
import { uploadMedia } from "@/lib/upload";
import { cn, displayName, isOnline, shortTime } from "@/lib/utils";
import type { ConversationSummary } from "@/types/models";
import { isMuted, MUTE_OPTIONS, muteUntil, previewText, useConversationActions } from "./use-chat";
import { useNow } from "./message-content";

type Tab = "all" | "unread" | "groups" | "archived";

// ---------------------------------------------------------------------------
// Row
// ---------------------------------------------------------------------------
const ConversationRow = memo(function ConversationRow({
  c,
  active,
  meId,
  online,
  muted,
}: {
  c: ConversationSummary;
  active: boolean;
  meId: string;
  online: boolean;
  muted: boolean;
}) {
  const confirm = useConfirm();
  const router = useRouter();
  const { markRead, mute, archive, clear } = useConversationActions();
  const unread = Number(c.unread_count);
  const mine = c.last_message_sender_id === meId;
  let preview = c.last_message_id ? previewText(c.last_message_type, c.last_message_body, c.last_message_deleted) : c.type === "group" ? "Group created" : "Start chatting";
  if (c.last_message_type === "system") preview = `${mine ? "You" : "Someone"} ${c.last_message_body ?? ""}`;
  else if (mine && c.last_message_id) preview = `You: ${preview}`;

  const items: MenuItem[] = [
    ...(unread ? [{ label: "Mark as read", icon: <CheckCheck />, onSelect: () => markRead.mutate(c.conversation_id) }] : []),
    ...(muted
      ? [{ label: "Unmute", icon: <Bell />, onSelect: () => mute.mutate({ id: c.conversation_id, until: null }) }]
      : MUTE_OPTIONS.map((o) => ({ label: `Mute ${o.label.toLowerCase()}`, icon: <BellOff />, onSelect: () => mute.mutate({ id: c.conversation_id, until: muteUntil(o.ms) }) }))),
    c.archived
      ? { label: "Unarchive", icon: <ArchiveRestore />, onSelect: () => archive.mutate({ id: c.conversation_id, archived: false }) }
      : { label: "Archive", icon: <Archive />, onSelect: () => archive.mutate({ id: c.conversation_id, archived: true }) },
    {
      label: "Delete conversation",
      icon: <Trash2 />,
      danger: true,
      onSelect: async () => {
        if (await confirm({ title: `Delete chat with ${c.title}?`, description: "Messages will be removed for you. Others keep their copy.", confirmLabel: "Delete", danger: true })) {
          clear.mutate(c.conversation_id, { onSuccess: () => active && router.replace("/chats") });
        }
      },
    },
  ];

  return (
    <li className="group relative">
      <Link
        href={`/chats/${c.conversation_id}`}
        aria-current={active ? "page" : undefined}
        className={cn("flex items-center gap-3 rounded-2xl px-3 py-2.5 pr-10 transition-colors", active ? "bg-brand-soft" : "hover:bg-surface-2")}
      >
        <Avatar mediaId={c.avatar_media_id} name={c.title} size="lg" online={online} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            <span className={cn("truncate text-[15px]", unread ? "font-extrabold" : "font-semibold")}>{c.title}</span>
            {c.type === "group" ? <Users className="h-3.5 w-3.5 shrink-0 text-muted" aria-label="Group" /> : null}
            {c.streak_count ? <span className="shrink-0 text-xs font-bold" aria-label={`${c.streak_count} day streak`}>🔥{c.streak_count}</span> : null}
            {muted ? <BellOff className="h-3.5 w-3.5 shrink-0 text-muted" aria-label="Muted" /> : null}
            <span className="ml-auto shrink-0 text-[11px] text-muted">{shortTime(c.last_message_at)}</span>
          </span>
          <span className="mt-0.5 flex items-center gap-2">
            <span className={cn("truncate text-sm", unread ? "font-semibold text-ink" : "text-muted", c.last_message_deleted && "italic")}>{preview}</span>
            {unread ? (
              <span className={cn("ml-auto shrink-0 rounded-full px-1.5 text-[11px] font-bold leading-5 text-white", muted ? "bg-muted" : "bg-accent")} aria-label={`${unread} unread`}>
                {unread > 99 ? "99+" : unread}
              </span>
            ) : null}
          </span>
        </span>
      </Link>
      <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-100 md:opacity-0 md:group-focus-within:opacity-100 md:group-hover:opacity-100">
        <Menu label={`Options for ${c.title}`} items={items} trigger={<span className="rounded-full p-1.5 text-muted hover:bg-surface-3"><MoreHorizontal className="h-4 w-4" /></span>} />
      </div>
    </li>
  );
});

// ---------------------------------------------------------------------------
// New chat / new group
// ---------------------------------------------------------------------------
function NewChatDialog({ open, onClose, onGroup }: { open: boolean; onClose: () => void; onGroup: () => void }) {
  const router = useRouter();
  const friends = useFriends();
  const [q, setQ] = useState("");
  const start = useMutation({
    mutationFn: (userId: string) => api.post<{ id: string }>("/api/conversations", { type: "direct", userId }),
    onSuccess: ({ id }) => {
      onClose();
      router.push(`/chats/${id}`);
    },
  });
  const list = (friends.data ?? []).filter((f) => {
    const t = q.trim().toLowerCase();
    return !t || f.username.includes(t) || f.display_name.toLowerCase().includes(t);
  });
  return (
    <Dialog open={open} onClose={onClose} variant="sheet" title="New chat">
      <button type="button" onClick={onGroup} className="mb-3 flex w-full items-center gap-3 rounded-2xl bg-brand-soft px-3 py-3 text-left font-bold text-brand">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-white">
          <Users className="h-5 w-5" />
        </span>
        New group
      </button>
      <label className="relative mb-2 block">
        <span className="sr-only">Search friends</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search friends" className="h-10 w-full rounded-xl border border-border bg-surface-2 pl-9 pr-3 text-sm focus:border-brand focus:outline-none" />
      </label>
      {friends.isPending ? (
        <ListSkeleton rows={4} />
      ) : friends.isError ? (
        <ErrorState description={errorMessage(friends.error)} onRetry={() => void friends.refetch()} />
      ) : list.length === 0 ? (
        <EmptyState icon={<Users />} title={friends.data?.length ? "No matches" : "No friends yet"} description={friends.data?.length ? undefined : "Add friends to start chatting."} action={friends.data?.length ? undefined : <Link href="/friends" className="font-bold text-brand">Find friends</Link>} />
      ) : (
        <ul className="space-y-0.5">
          {list.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                disabled={start.isPending}
                onClick={() => start.mutate(f.id)}
                className="flex w-full items-center gap-3 rounded-2xl px-2 py-2 text-left hover:bg-surface-2 disabled:opacity-60"
              >
                <Avatar mediaId={f.avatar_media_id} name={displayName(f)} size="md" online={isOnline(f.last_seen_at)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{displayName(f)}</span>
                  <span className="block truncate text-xs text-muted">@{f.username}</span>
                </span>
                {start.isPending && start.variables === f.id ? <span className="text-xs text-muted">Opening…</span> : null}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

function NewGroupDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const qc = useQueryClient();
  const config = useAppConfig();
  const [step, setStep] = useState<1 | 2>(1);
  const [members, setMembers] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [avatar, setAvatar] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const preview = useMemo(() => (avatar ? URL.createObjectURL(avatar) : null), [avatar]);

  const reset = () => {
    setStep(1);
    setMembers([]);
    setName("");
    setDescription("");
    setAvatar(null);
    setProgress(null);
    if (preview) URL.revokeObjectURL(preview);
  };
  const create = useMutation({
    mutationFn: async () => {
      let avatarMediaId: string | undefined;
      if (avatar) {
        setProgress(0);
        avatarMediaId = (await uploadMedia(avatar, { purpose: "group_avatar", onProgress: setProgress }).promise).id;
      }
      return api.post<{ id: string }>("/api/conversations", {
        type: "group",
        name: name.trim(),
        memberIds: members,
        description: description.trim() || undefined,
        avatarMediaId,
      });
    },
    onSuccess: ({ id }) => {
      void qc.invalidateQueries({ queryKey: qk.conversationsAll });
      toast.success("Group created");
      reset();
      onClose();
      router.push(`/chats/${id}`);
    },
    onError: () => setProgress(null),
  });

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!create.isPending) onClose();
      }}
      variant="sheet"
      title={step === 1 ? "New group" : "Group details"}
      description={step === 1 ? "Pick friends to add (up to 99)." : `${members.length} member${members.length === 1 ? "" : "s"} selected`}
      footer={
        step === 1 ? (
          <>
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={!members.length} onClick={() => setStep(2)}>
              Next
            </Button>
          </>
        ) : (
          <>
            <Button variant="ghost" disabled={create.isPending} onClick={() => setStep(1)}>
              Back
            </Button>
            <Button disabled={!name.trim()} loading={create.isPending} onClick={() => create.mutate()}>
              {progress !== null && progress < 1 ? `Uploading ${Math.round(progress * 100)}%` : "Create group"}
            </Button>
          </>
        )
      }
    >
      {step === 1 ? (
        <FriendPicker selected={members} onChange={setMembers} max={99} className="h-80" />
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-4">
            <label className={cn("relative flex h-20 w-20 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full bg-surface-2 text-muted", !config.data?.features.uploads && "pointer-events-none opacity-50")}>
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="Group photo preview" className="h-full w-full object-cover" />
              ) : (
                <Camera className="h-7 w-7" />
              )}
              <input type="file" accept="image/jpeg,image/png,image/webp" hidden aria-label="Group photo" onChange={(e) => setAvatar(e.target.files?.[0] ?? null)} />
            </label>
            <label className="block flex-1 text-sm font-semibold">
              Group name
              <Input className="mt-1.5" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="e.g. Weekend crew" data-autofocus />
            </label>
          </div>
          <label className="block text-sm font-semibold">
            Description (optional)
            <Textarea className="mt-1.5" value={description} maxLength={300} onChange={(e) => setDescription(e.target.value)} placeholder="What's this group about?" />
          </label>
        </div>
      )}
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// List
// ---------------------------------------------------------------------------
export function ChatList() {
  const me = useMe();
  const router = useRouter();
  const pathname = usePathname();
  const params = useParams<{ id?: string }>();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");
  const now = useNow(60_000);
  const inbox = useConversations(false);
  const archived = useConversations(true);
  const source = tab === "archived" ? archived : inbox;
  const newOpen = searchParams.get("new") === "1";
  const groupOpen = searchParams.get("group") === "1";
  const setDialog = (key: "new" | "group" | null) => router.replace(key ? `${pathname}?${key}=1` : pathname, { scroll: false });

  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    return (source.data ?? []).filter((c) => {
      if (tab === "unread" && !Number(c.unread_count)) return false;
      if (tab === "groups" && c.type !== "group") return false;
      if (!term) return true;
      return c.title.toLowerCase().includes(term) || (c.other_username ?? "").includes(term);
    });
  }, [source.data, tab, q]);
  const presence = usePresence(list.filter((c) => c.type === "direct").map((c) => c.other_user_id));
  const unreadTotal = (inbox.data ?? []).filter((c) => Number(c.unread_count) > 0).length;

  let body: ReactNode;
  if (source.isPending) body = <ListSkeleton rows={8} />;
  else if (source.isError) body = <ErrorState description={errorMessage(source.error)} onRetry={() => void source.refetch()} />;
  else if (list.length === 0) {
    body = q.trim() ? (
      <EmptyState icon={<Search />} title="No chats found" description={`Nothing matches "${q.trim()}".`} />
    ) : tab === "archived" ? (
      <EmptyState icon={<Archive />} title="No archived chats" description="Archived chats stay out of your inbox until a new message arrives." />
    ) : tab === "unread" ? (
      <EmptyState icon={<CheckCheck />} title="You're all caught up" description="No unread messages." />
    ) : tab === "groups" ? (
      <EmptyState icon={<Users />} title="No groups yet" action={<Button onClick={() => setDialog("group")}>Create a group</Button>} />
    ) : (
      <EmptyState icon={<MessageSquareDashed />} title="No chats yet" description="Start a conversation with a friend." action={<Button onClick={() => setDialog("new")}>Start a chat</Button>} />
    );
  } else {
    body = (
      <ul className="space-y-0.5 px-2 pb-4" aria-label="Conversations">
        {list.map((c) => (
          <ConversationRow
            key={c.conversation_id}
            c={c}
            active={params.id === c.conversation_id}
            meId={me.user.id}
            online={c.type === "direct" && isOnline(presence.data?.get(c.other_user_id ?? ""))}
            muted={isMuted(c.muted_until, now)}
          />
        ))}
      </ul>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 px-4 pb-3 pt-4">
        <h1 className="flex-1 font-display text-2xl font-extrabold tracking-tight">Chats</h1>
        <Link href="/chats/starred" className="rounded-full p-2.5 text-ink-2 hover:bg-surface-2" aria-label="Starred messages">
          <Star className="h-5 w-5" />
        </Link>
        <button type="button" onClick={() => setDialog("group")} className="rounded-full p-2.5 text-ink-2 hover:bg-surface-2" aria-label="New group">
          <Users className="h-5 w-5" />
        </button>
        <Button size="icon" variant="gradient" onClick={() => setDialog("new")} aria-label="New chat">
          <MessageCirclePlus className="h-5 w-5" />
        </Button>
      </div>
      <div className="space-y-3 px-4 pb-3">
        <label className="relative block">
          <span className="sr-only">Search chats</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search chats" className="h-10 w-full rounded-xl border border-border bg-surface-2 pl-9 pr-3 text-sm focus:border-brand focus:outline-none" />
        </label>
        <Tabs<Tab>
          ariaLabel="chat-filters"
          value={tab}
          onChange={setTab}
          items={[
            { value: "all", label: "All" },
            { value: "unread", label: "Unread", count: unreadTotal },
            { value: "groups", label: "Groups" },
            { value: "archived", label: "Archived" },
          ]}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">{body}</div>
      <NewChatDialog open={newOpen} onClose={() => setDialog(null)} onGroup={() => setDialog("group")} />
      <NewGroupDialog open={groupOpen} onClose={() => setDialog(null)} />
    </div>
  );
}

/** Two-pane layout: list + conversation on desktop, one at a time on mobile. */
export function ChatsShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const inConversation = /^\/chats\/[^/]+/.test(pathname);
  return (
    <div className="flex md:h-dvh">
      <aside className={cn("w-full shrink-0 border-r border-border bg-surface md:flex md:w-[340px] lg:w-[380px]", inConversation ? "hidden" : "flex")}>
        <div className="w-full">
          <ChatList />
        </div>
      </aside>
      <section className={cn("min-w-0 flex-1 bg-bg", inConversation ? "fixed inset-0 z-30 flex flex-col md:static md:z-auto" : "hidden md:flex md:flex-col")}>
        {children}
      </section>
    </div>
  );
}

export function SelectChatPanel() {
  return (
    <div className="flex h-full flex-1 flex-col items-center justify-center p-6">
      <EmptyState
        icon={<MessageSquareDashed />}
        title="Select a chat"
        description="Choose a conversation from the list, or start a new one with a friend."
        action={
          <div className="flex gap-2">
            <Link href="/chats?new=1" className="rounded-xl bg-brand px-4 py-2 text-sm font-bold text-white">
              New chat
            </Link>
            <Link href="/chats?group=1" className="rounded-xl border border-border px-4 py-2 text-sm font-bold">
              New group
            </Link>
          </div>
        }
      />
    </div>
  );
}
