"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "motion/react";
import { Check, ListPlus, Pencil, Plus, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/ui/feedback";
import { Field, Input } from "@/components/ui/input";
import { FriendPicker } from "@/components/social/friend-picker";
import { api, errorMessage } from "@/lib/api/client";
import { qk } from "@/lib/query-keys";
import { cn, displayName } from "@/lib/utils";
import type { Friend } from "@/types/models";
import { useFriendLists, useFriends } from "./hooks";
import type { FriendList } from "./types";

function useSaveList() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name, memberIds }: { id?: string; name: string; memberIds: string[] }) =>
      id
        ? api.put<{ id: string }>(`/api/friends/lists/${id}`, { name, memberIds })
        : api.post<{ id: string }>("/api/friends/lists", { name, memberIds }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: qk.friendLists }),
  });
}

/** Create / edit a list: name + members picked from friends. */
export function ListEditorDialog({
  open,
  onClose,
  list,
  initialMemberIds = [],
}: {
  open: boolean;
  onClose: () => void;
  list: FriendList | null;
  initialMemberIds?: string[];
}) {
  const save = useSaveList();
  const [name, setName] = useState(list?.name ?? "");
  const [members, setMembers] = useState<string[]>(list?.member_ids ?? initialMemberIds);
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const trimmed = name.trim();
    if (!trimmed) return setError("Give the list a name");
    if (trimmed.length > 40) return setError("At most 40 characters");
    setError(null);
    save.mutate(
      { id: list?.id, name: trimmed, memberIds: members },
      {
        onSuccess: () => {
          toast.success(list ? "List updated" : "List created");
          onClose();
        },
        onError: (e) => setError(errorMessage(e)),
      },
    );
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      variant="sheet"
      title={list ? "Edit list" : "New friend list"}
      description="Lists are private to you. Use them to share stories with a custom audience."
      className="sm:max-w-lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={save.isPending}>
            {list ? "Save" : "Create list"}
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex min-h-[50dvh] flex-col gap-4 sm:min-h-[420px]"
      >
        <Field label="List name" error={error}>
          {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="e.g. Close friends" data-autofocus />}
        </Field>
        <div className="flex min-h-0 flex-1 flex-col">
          <p className="mb-2 text-sm font-semibold text-ink-2">
            Members <span className="text-muted">({members.length})</span>
          </p>
          <FriendPicker selected={members} onChange={setMembers} max={500} className="h-72 flex-1" />
        </div>
      </form>
    </Dialog>
  );
}

/** Toggle one friend's membership across your lists. */
export function AddToListDialog({ friend, onClose }: { friend: Friend | null; onClose: () => void }) {
  const lists = useFriendLists();
  const save = useSaveList();
  const [editorOpen, setEditorOpen] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const toggle = (list: FriendList) => {
    if (!friend) return;
    const has = list.member_ids.includes(friend.id);
    const memberIds = has ? list.member_ids.filter((id) => id !== friend.id) : [...list.member_ids, friend.id];
    setBusyId(list.id);
    save.mutate(
      { id: list.id, name: list.name, memberIds },
      {
        onSuccess: () => toast.success(has ? `Removed from ${list.name}` : `Added to ${list.name}`),
        onSettled: () => setBusyId(null),
      },
    );
  };

  return (
    <>
      <Dialog
        open={friend !== null && !editorOpen}
        onClose={onClose}
        variant="sheet"
        title={friend ? `Add ${displayName(friend)} to a list` : undefined}
        footer={
          <Button variant="outline" onClick={() => setEditorOpen(true)}>
            <Plus className="h-4 w-4" /> New list
          </Button>
        }
      >
        {lists.isPending ? (
          <ListSkeleton rows={3} />
        ) : lists.isError ? (
          <ErrorState description={errorMessage(lists.error)} onRetry={() => void lists.refetch()} />
        ) : lists.data.length === 0 ? (
          <EmptyState icon={<ListPlus />} title="No lists yet" description="Create a list to group friends for custom story audiences." />
        ) : (
          <ul className="space-y-1">
            {lists.data.map((list) => {
              const on = friend ? list.member_ids.includes(friend.id) : false;
              return (
                <li key={list.id}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    disabled={busyId !== null}
                    onClick={() => toggle(list)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left hover:bg-surface-2 disabled:opacity-60",
                      on && "bg-brand-soft",
                    )}
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-surface-2 text-brand">
                      <Users className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{list.name}</span>
                      <span className="block text-xs text-muted">{list.member_ids.length} {list.member_ids.length === 1 ? "friend" : "friends"}</span>
                    </span>
                    <span className={cn("flex h-6 w-6 items-center justify-center rounded-full border-2", on ? "border-brand bg-brand text-white" : "border-border")}>
                      {on ? <Check className="h-3.5 w-3.5" strokeWidth={3} /> : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Dialog>
      {editorOpen ? (
        <ListEditorDialog
          open
          onClose={() => setEditorOpen(false)}
          list={null}
          initialMemberIds={friend ? [friend.id] : []}
        />
      ) : null}
    </>
  );
}

/** Friends > Lists tab: CRUD for custom friend lists. */
export function ListsTab() {
  const lists = useFriendLists();
  const friends = useFriends();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<FriendList | "new" | null>(null);

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/api/friends/lists/${id}`),
    onSuccess: () => toast("List deleted"),
    onSettled: () => queryClient.invalidateQueries({ queryKey: qk.friendLists }),
  });

  const byId = new Map((friends.data ?? []).map((f) => [f.id, f]));

  return (
    <section aria-label="Friend lists" className="space-y-3">
      <div className="flex items-center justify-between gap-3 px-1">
        <p className="text-sm text-muted">Private groups of friends for custom story audiences.</p>
        <Button size="sm" onClick={() => setEditing("new")}>
          <Plus className="h-4 w-4" /> New list
        </Button>
      </div>
      {lists.isPending ? (
        <ListSkeleton rows={3} />
      ) : lists.isError ? (
        <ErrorState description={errorMessage(lists.error)} onRetry={() => void lists.refetch()} />
      ) : lists.data.length === 0 ? (
        <EmptyState
          icon={<ListPlus />}
          title="No friend lists yet"
          description="Group friends like “Close friends” or “Family” and share stories with just them."
          action={<Button onClick={() => setEditing("new")}>Create your first list</Button>}
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          <AnimatePresence initial={false}>
            {lists.data.map((list, i) => {
              const members = list.member_ids.map((id) => byId.get(id)).filter((f): f is Friend => Boolean(f));
              return (
                <motion.li
                  key={list.id}
                  layout
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.97 }}
                  transition={{ duration: 0.18, delay: Math.min(i, 8) * 0.03 }}
                  className="rounded-3xl border border-border bg-surface p-4 shadow-[var(--shadow-soft)]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate font-display text-base font-bold">{list.name}</h3>
                      <p className="text-xs text-muted">
                        {list.member_ids.length} {list.member_ids.length === 1 ? "friend" : "friends"}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button size="icon-sm" variant="ghost" aria-label={`Edit ${list.name}`} onClick={() => setEditing(list)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Delete ${list.name}`}
                        className="hover:text-danger"
                        disabled={remove.isPending && remove.variables === list.id}
                        onClick={async () => {
                          const ok = await confirm({
                            title: `Delete “${list.name}”?`,
                            description: "Stories already shared with this list keep their audience. This can't be undone.",
                            confirmLabel: "Delete",
                            danger: true,
                          });
                          if (ok) remove.mutate(list.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {members.length ? (
                    <div className="mt-3 flex items-center">
                      <div className="flex -space-x-2">
                        {members.slice(0, 6).map((m) => (
                          <Avatar key={m.id} mediaId={m.avatar_media_id} name={displayName(m)} size="sm" className="rounded-full ring-2 ring-surface" />
                        ))}
                      </div>
                      {members.length > 6 ? <span className="ml-2 text-xs font-semibold text-muted">+{members.length - 6}</span> : null}
                    </div>
                  ) : (
                    <button type="button" onClick={() => setEditing(list)} className="mt-3 text-xs font-semibold text-brand hover:underline">
                      Add friends to this list
                    </button>
                  )}
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
      {editing ? (
        <ListEditorDialog
          key={editing === "new" ? "new" : editing.id}
          open
          onClose={() => setEditing(null)}
          list={editing === "new" ? null : editing}
        />
      ) : null}
    </section>
  );
}
