"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import {
  Archive, ArchiveRestore, Bell, BellOff, Ban, Camera, Crown, FileText, Flag, LogOut, MoreVertical, Pencil, Play, Shield, ShieldOff, Trash2,
  User, UserMinus, UserPlus, X,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Input, Textarea } from "@/components/ui/input";
import { Menu, Switch, type MenuItem } from "@/components/ui/controls";
import { Skeleton } from "@/components/ui/feedback";
import { useConfirm } from "@/components/ui/confirm";
import { FriendPicker } from "@/components/social/friend-picker";
import { ReportDialog } from "@/components/moderation/report-dialog";
import { useAppConfig } from "@/hooks/use-app-config";
import { api, errorMessage } from "@/lib/api/client";
import { qk } from "@/lib/query-keys";
import { uploadMedia } from "@/lib/upload";
import { cn, displayName, mediaUrl } from "@/lib/utils";
import type { DisappearMode } from "@/types/models";
import type { ChatMessage, ConversationDetail, MemberWithProfile } from "./types";
import { isMuted, MUTE_OPTIONS, muteUntil, useConversationActions } from "./use-chat";
import { useNow } from "./message-content";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border px-5 py-4">
      <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">{title}</h3>
      {children}
    </section>
  );
}

function Row({ icon, label, onClick, danger, disabled }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn("flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left text-sm font-semibold hover:bg-surface-2 disabled:opacity-50 [&>svg]:h-5 [&>svg]:w-5", danger ? "text-danger" : "text-ink")}
    >
      {icon}
      {label}
    </button>
  );
}

function SharedMedia({ conversationId, onJump }: { conversationId: string; onJump: (id: string) => void }) {
  const media = useQuery({
    queryKey: ["conversation-media", conversationId],
    queryFn: () => api.get<ChatMessage[]>(`/api/conversations/${conversationId}/media`, { limit: 30 }),
  });
  if (media.isPending) {
    return (
      <div className="grid grid-cols-3 gap-1">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square rounded-lg" />
        ))}
      </div>
    );
  }
  if (media.isError) return <p className="text-sm text-danger">{errorMessage(media.error)}</p>;
  const tiles = (media.data ?? []).flatMap((m) => m.attachments.map((a) => ({ m, a })));
  if (!tiles.length) return <p className="text-sm text-muted">Photos, videos and files you share will appear here.</p>;
  return (
    <div className="grid grid-cols-3 gap-1">
      {tiles.slice(0, 30).map(({ m, a }) => (
        <button
          key={a.media_id}
          type="button"
          onClick={() => onJump(m.id)}
          className="relative aspect-square overflow-hidden rounded-lg bg-surface-2"
          aria-label={`Show ${a.kind ?? "file"} in chat`}
        >
          {a.kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mediaUrl(a.media_id)} alt="" loading="lazy" className="h-full w-full object-cover" />
          ) : a.kind === "video" ? (
            <>
              <video src={mediaUrl(a.media_id)} muted preload="metadata" className="h-full w-full object-cover" />
              <Play className="absolute inset-0 m-auto h-6 w-6 text-white drop-shadow" fill="currentColor" />
            </>
          ) : (
            <span className="flex h-full flex-col items-center justify-center gap-1 p-1 text-center">
              <FileText className="h-6 w-6 text-brand" />
              <span className="line-clamp-2 text-[10px]">{a.kind === "audio" ? "Voice message" : a.file_name ?? "File"}</span>
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

function EditGroupDialog({ detail, onClose }: { detail: ConversationDetail; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(detail.group?.name ?? "");
  const [description, setDescription] = useState(detail.group?.description ?? "");
  const save = useMutation({
    mutationFn: () =>
      api.patch(`/api/conversations/${detail.conversation.id}`, {
        name: name.trim() !== detail.group?.name ? name.trim() : undefined,
        description: description !== detail.group?.description ? description : undefined,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.conversation(detail.conversation.id) });
      void qc.invalidateQueries({ queryKey: qk.conversationsAll });
      toast.success("Group updated");
      onClose();
    },
  });
  const changed = name.trim() !== detail.group?.name || description !== detail.group?.description;
  return (
    <Dialog
      open
      onClose={onClose}
      title="Edit group"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!changed || !name.trim()} loading={save.isPending} onClick={() => save.mutate()}>
            Save
          </Button>
        </>
      }
    >
      <label className="block text-sm font-semibold">
        Name
        <Input className="mt-1.5" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="mt-4 block text-sm font-semibold">
        Description
        <Textarea className="mt-1.5" value={description} maxLength={300} onChange={(e) => setDescription(e.target.value)} />
      </label>
    </Dialog>
  );
}

export function InfoPanel({
  open,
  onClose,
  detail,
  meId,
  onJump,
  onLeft,
}: {
  open: boolean;
  onClose: () => void;
  detail: ConversationDetail;
  meId: string;
  onJump: (messageId: string) => void;
  onLeft: () => void;
}) {
  const qc = useQueryClient();
  const router = useRouter();
  const confirm = useConfirm();
  const config = useAppConfig();
  const now = useNow(60_000);
  const { mute, archive, clear } = useConversationActions();
  const id = detail.conversation.id;
  const isGroup = detail.conversation.type === "group";
  const group = detail.group;
  const role = detail.me.role;
  const isAdmin = role === "owner" || role === "admin";
  const canEdit = isGroup && (isAdmin || !group?.only_admins_edit);
  const muted = isMuted(detail.me.muted_until, now);
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);
  const [toAdd, setToAdd] = useState<string[]>([]);
  const [report, setReport] = useState<null | { type: "user" | "group"; id: string }>(null);
  const [avatarProgress, setAvatarProgress] = useState<number | null>(null);
  const active = detail.members.filter((m) => !m.left_at).sort((a, b) => {
    const rank = { owner: 0, admin: 1, member: 2 } as const;
    return rank[a.role] - rank[b.role] || displayName(a.profile).localeCompare(displayName(b.profile));
  });

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: qk.conversation(id) });
    void qc.invalidateQueries({ queryKey: qk.conversationsAll });
  };
  const call = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: refresh,
  });
  const run = (fn: () => Promise<unknown>, success: string) => call.mutate(fn, { onSuccess: () => toast.success(success) });

  const title = isGroup ? group?.name ?? "Group" : displayName(detail.other);
  const avatarId = isGroup ? group?.avatar_media_id : detail.other?.avatar_media_id;

  const memberMenu = (m: MemberWithProfile): MenuItem[] => {
    if (m.user_id === meId) return [];
    const items: MenuItem[] = [];
    const name = m.profile?.username ? `@${m.profile.username}` : "this member";
    if (m.profile?.username) items.push({ label: "View profile", icon: <User />, onSelect: () => router.push(`/profile/${m.profile!.username}`) });
    if (isAdmin && m.role === "member") {
      items.push({ label: "Make admin", icon: <Shield />, onSelect: () => run(() => api.patch(`/api/conversations/${id}/members/${m.user_id}`, { role: "admin" }), `${name} is now an admin`) });
    }
    if (role === "owner" && m.role === "admin") {
      items.push({ label: "Remove as admin", icon: <ShieldOff />, onSelect: () => run(() => api.patch(`/api/conversations/${id}/members/${m.user_id}`, { role: "member" }), `${name} is no longer an admin`) });
    }
    if (role === "owner") {
      items.push({
        label: "Transfer ownership",
        icon: <Crown />,
        onSelect: async () => {
          if (await confirm({ title: `Make ${name} the owner?`, description: "You'll become an admin. This can't be undone by you.", confirmLabel: "Transfer" })) {
            run(() => api.patch(`/api/conversations/${id}/members/${m.user_id}`, { role: "owner" }), "Ownership transferred");
          }
        },
      });
    }
    if (m.role !== "owner" && (role === "owner" || (role === "admin" && m.role === "member"))) {
      items.push({
        label: "Remove from group",
        icon: <UserMinus />,
        danger: true,
        onSelect: async () => {
          if (await confirm({ title: `Remove ${name}?`, confirmLabel: "Remove", danger: true })) {
            run(() => api.delete(`/api/conversations/${id}/members/${m.user_id}`), `${name} was removed`);
          }
        },
      });
    }
    return items;
  };

  const changeAvatar = (file: File | undefined) => {
    if (!file) return;
    setAvatarProgress(0);
    const h = uploadMedia(file, { purpose: "group_avatar", onProgress: setAvatarProgress });
    h.promise
      .then((media) => api.patch(`/api/conversations/${id}`, { avatarMediaId: media.id }))
      .then(() => {
        refresh();
        toast.success("Group photo updated");
      })
      .catch((err) => toast.error(errorMessage(err)))
      .finally(() => setAvatarProgress(null));
  };

  const deleteChat = async () => {
    if (await confirm({ title: "Delete this conversation?", description: "Messages will be removed from your devices. Others in the chat keep their copy.", confirmLabel: "Delete", danger: true })) {
      clear.mutate(id, { onSuccess: onLeft });
    }
  };

  const content = (
    <div className="flex h-full flex-col bg-surface">
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="font-display text-lg font-bold">{isGroup ? "Group info" : "Chat info"}</h2>
        <button type="button" onClick={onClose} className="rounded-full p-2 text-muted hover:bg-surface-2" aria-label="Close chat info">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        <div className="flex flex-col items-center px-5 pb-5 text-center">
          <div className="relative">
            <Avatar mediaId={avatarId} name={title} size="2xl" />
            {canEdit && config.data?.features.uploads ? (
              <label className="absolute bottom-0 right-0 cursor-pointer rounded-full bg-brand p-2 text-white shadow" aria-label="Change group photo">
                <Camera className="h-4 w-4" />
                <input type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={(e) => changeAvatar(e.target.files?.[0])} />
              </label>
            ) : null}
            {avatarProgress !== null ? (
              <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/50 text-sm font-bold text-white">{Math.round(avatarProgress * 100)}%</span>
            ) : null}
          </div>
          <p className="mt-3 font-display text-xl font-bold">{title}</p>
          {isGroup ? (
            <>
              <p className="text-sm text-muted">{active.length} members</p>
              {group?.description ? <p className="mt-2 whitespace-pre-wrap text-sm text-ink-2">{group.description}</p> : null}
              {canEdit ? (
                <Button variant="outline" size="sm" className="mt-3" onClick={() => setEditing(true)}>
                  <Pencil className="h-4 w-4" /> Edit name & description
                </Button>
              ) : null}
            </>
          ) : detail.other ? (
            <>
              <p className="text-sm text-muted">@{detail.other.username}</p>
              <Link href={`/profile/${detail.other.username}`} className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-brand-soft px-3 py-1.5 text-sm font-bold text-brand">
                <User className="h-4 w-4" /> View profile
              </Link>
            </>
          ) : null}
        </div>

        <Section title="Shared media">
          <SharedMedia conversationId={id} onJump={onJump} />
        </Section>

        {isGroup ? (
          <Section title={`Members · ${active.length}`}>
            {canEdit ? <Row icon={<UserPlus />} label="Add members" onClick={() => setAdding(true)} /> : null}
            <ul>
              {active.map((m) => {
                const items = memberMenu(m);
                return (
                  <li key={m.user_id} className="flex items-center gap-3 rounded-xl px-2 py-2">
                    <Avatar mediaId={m.profile?.avatar_media_id} name={displayName(m.profile)} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">
                        {displayName(m.profile)}
                        {m.user_id === meId ? " (you)" : ""}
                      </span>
                      {m.profile?.username ? <span className="block truncate text-xs text-muted">@{m.profile.username}</span> : null}
                    </span>
                    {m.role !== "member" ? (
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase", m.role === "owner" ? "bg-accent/15 text-accent" : "bg-brand-soft text-brand")}>{m.role}</span>
                    ) : null}
                    {items.length ? (
                      <Menu label={`Actions for ${displayName(m.profile)}`} items={items} trigger={<span className="rounded-full p-1.5 text-muted hover:bg-surface-2"><MoreVertical className="h-4 w-4" /></span>} />
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </Section>
        ) : null}

        {isGroup && isAdmin ? (
          <Section title="Group settings">
            <Switch
              checked={Boolean(group?.only_admins_send)}
              onChange={(v) => run(() => api.patch(`/api/conversations/${id}`, { onlyAdminsSend: v }), "Setting saved")}
              label="Only admins can send messages"
            />
            <Switch
              checked={Boolean(group?.only_admins_edit)}
              onChange={(v) => run(() => api.patch(`/api/conversations/${id}`, { onlyAdminsEdit: v }), "Setting saved")}
              label="Only admins can edit group info"
              description="Name, photo, members and pinned messages"
            />
          </Section>
        ) : null}

        <Section title="Disappearing messages">
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Disappearing messages">
            {(["off", "24h", "7d"] as DisappearMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={detail.conversation.disappear_mode === mode}
                disabled={(isGroup && !isAdmin) || call.isPending}
                onClick={() => run(() => api.post(`/api/conversations/${id}/disappearing`, { mode }), mode === "off" ? "Disappearing messages off" : "Disappearing messages on")}
                className={cn(
                  "rounded-xl border px-2 py-2 text-sm font-bold disabled:opacity-50",
                  detail.conversation.disappear_mode === mode ? "border-brand bg-brand-soft text-brand" : "border-border hover:bg-surface-2",
                )}
              >
                {mode === "off" ? "Off" : mode === "24h" ? "24 hours" : "7 days"}
              </button>
            ))}
          </div>
          {isGroup && !isAdmin ? <p className="mt-2 text-xs text-muted">Only admins can change this.</p> : null}
        </Section>

        <Section title="Notifications & privacy">
          {muted ? (
            <Row icon={<Bell />} label="Unmute notifications" onClick={() => mute.mutate({ id, until: null })} />
          ) : (
            <Menu
              label="Mute notifications"
              align="start"
              trigger={
                <span className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left text-sm font-semibold hover:bg-surface-2">
                  <BellOff className="h-5 w-5" /> Mute notifications
                </span>
              }
              items={MUTE_OPTIONS.map((o) => ({ label: o.label, onSelect: () => mute.mutate({ id, until: muteUntil(o.ms) }) }))}
            />
          )}
          <Row
            icon={detail.me.archived ? <ArchiveRestore /> : <Archive />}
            label={detail.me.archived ? "Unarchive chat" : "Archive chat"}
            onClick={() => archive.mutate({ id, archived: !detail.me.archived })}
          />
          {!isGroup && detail.other ? (
            detail.blocked ? (
              <Row
                icon={<Ban />}
                label={`Unblock @${detail.other.username}`}
                onClick={() => run(() => api.delete(`/api/users/${detail.other!.id}/block`), "User unblocked")}
              />
            ) : (
              <Row
                icon={<Ban />}
                danger
                label={`Block @${detail.other.username}`}
                onClick={async () => {
                  if (await confirm({ title: `Block @${detail.other!.username}?`, description: "They won't be able to message or call you, or see your profile.", confirmLabel: "Block", danger: true })) {
                    run(() => api.post(`/api/users/${detail.other!.id}/block`), "User blocked");
                  }
                }}
              />
            )
          ) : null}
          {isGroup ? (
            <Row icon={<Flag />} danger label="Report group" onClick={() => setReport({ type: "group", id })} />
          ) : detail.other ? (
            <Row icon={<Flag />} danger label={`Report @${detail.other.username}`} onClick={() => setReport({ type: "user", id: detail.other!.id })} />
          ) : null}
          {isGroup ? (
            <Row
              icon={<LogOut />}
              danger
              label="Leave group"
              onClick={async () => {
                if (await confirm({ title: "Leave this group?", description: role === "owner" ? "Ownership will pass to another member." : undefined, confirmLabel: "Leave", danger: true })) {
                  call.mutate(() => api.post(`/api/conversations/${id}/leave`), {
                    onSuccess: () => {
                      toast.success("You left the group");
                      onLeft();
                    },
                  });
                }
              }}
            />
          ) : null}
          <Row icon={<Trash2 />} danger label="Delete conversation" onClick={deleteChat} />
        </Section>
      </div>
    </div>
  );

  return (
    <>
      <AnimatePresence>
        {open ? (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/40 xl:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onClose}
              aria-hidden
            />
            <motion.aside
              initial={{ x: 40, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: 40, opacity: 0 }}
              transition={{ type: "spring", stiffness: 420, damping: 38 }}
              className="fixed inset-y-0 right-0 z-50 w-full border-l border-border shadow-[var(--shadow-pop)] sm:w-96 xl:static xl:z-auto xl:w-80 xl:shrink-0 xl:shadow-none"
              aria-label={isGroup ? "Group info" : "Chat info"}
            >
              {content}
            </motion.aside>
          </>
        ) : null}
      </AnimatePresence>
      {editing ? <EditGroupDialog detail={detail} onClose={() => setEditing(false)} /> : null}
      {adding ? (
        <Dialog
          open
          onClose={() => setAdding(false)}
          variant="sheet"
          title="Add members"
          footer={
            <>
              <Button variant="ghost" onClick={() => setAdding(false)}>
                Cancel
              </Button>
              <Button
                disabled={!toAdd.length}
                loading={call.isPending}
                onClick={() =>
                  call.mutate(() => api.post<{ added: number }>(`/api/conversations/${id}/members`, { userIds: toAdd }), {
                    onSuccess: (r) => {
                      const added = (r as { added: number }).added;
                      toast.success(added ? `Added ${added} member${added === 1 ? "" : "s"}` : "No one new was added");
                      setToAdd([]);
                      setAdding(false);
                    },
                  })
                }
              >
                Add{toAdd.length ? ` (${toAdd.length})` : ""}
              </Button>
            </>
          }
        >
          <FriendPicker selected={toAdd} onChange={setToAdd} exclude={active.map((m) => m.user_id)} max={Math.max(0, 100 - active.length)} className="h-80" />
        </Dialog>
      ) : null}
      {report ? <ReportDialog open onClose={() => setReport(null)} targetType={report.type} targetId={report.id} targetLabel={report.type === "group" ? "group" : `@${detail.other?.username ?? "user"}`} /> : null}
    </>
  );
}
