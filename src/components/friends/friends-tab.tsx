"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence } from "motion/react";
import { Ban, Camera, ListPlus, MessageCircle, MoreHorizontal, Search, User, UserMinus, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Menu } from "@/components/ui/controls";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/ui/feedback";
import { usePresence } from "@/hooks/use-presence";
import { errorMessage } from "@/lib/api/client";
import { isOnline, lastSeenLabel } from "@/lib/utils";
import type { Friend } from "@/types/models";
import { AddToListDialog } from "./friend-lists";
import { useFriendModeration, useFriends, useOpenChat } from "./hooks";
import { UserRow } from "./user-row";

/** Friends > Friends tab: searchable list with presence, streaks and actions. */
export function FriendsTab({ onAddFriends }: { onAddFriends: () => void }) {
  const router = useRouter();
  const friends = useFriends();
  const presence = usePresence((friends.data ?? []).map((f) => f.id));
  const moderation = useFriendModeration();
  const openChat = useOpenChat();
  const [q, setQ] = useState("");
  const [listFriend, setListFriend] = useState<Friend | null>(null);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase().replace(/^@/, "");
    return (friends.data ?? [])
      .filter((f) => !term || f.username.includes(term) || f.display_name.toLowerCase().includes(term))
      .map((f) => {
        const seen = presence.data?.get(f.id) ?? f.last_seen_at;
        return { friend: f, seen, online: isOnline(seen) };
      })
      .sort((a, b) => Number(b.online) - Number(a.online));
  }, [friends.data, presence.data, q]);

  if (friends.isPending) return <ListSkeleton rows={8} />;
  if (friends.isError) return <ErrorState description={errorMessage(friends.error)} onRetry={() => void friends.refetch()} />;
  if (friends.data.length === 0) {
    return (
      <EmptyState
        icon={<Users />}
        title="No friends yet"
        description="Find people you know by username and start chatting, snapping and building streaks."
        action={
          <Button onClick={onAddFriends}>
            <UserPlus className="h-4 w-4" /> Add friends
          </Button>
        }
      />
    );
  }

  const onlineCount = rows.filter((r) => r.online).length;

  return (
    <section aria-label="Your friends">
      <div className="mb-3 flex items-center gap-3">
        <label className="relative block flex-1">
          <span className="sr-only">Filter friends</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search ${friends.data.length} ${friends.data.length === 1 ? "friend" : "friends"}`}
            className="h-11 w-full rounded-xl border border-border bg-surface pl-9 pr-3 text-sm focus:border-brand focus:outline-none focus:ring-4 focus:ring-[var(--ring)]"
          />
        </label>
        {onlineCount ? (
          <span className="hidden shrink-0 items-center gap-1.5 text-xs font-semibold text-muted sm:inline-flex">
            <span className="h-2 w-2 rounded-full bg-success" aria-hidden /> {onlineCount} online
          </span>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <EmptyState icon={<Search />} title="No matches" description={`No friends match “${q.trim()}”.`} />
      ) : (
        <ul className="space-y-0.5">
          <AnimatePresence initial={false}>
            {rows.map(({ friend: f, seen, online }, i) => (
              <UserRow
                key={f.id}
                index={i}
                user={f}
                online={online}
                subtitle={
                  <>
                    @{f.username}
                    {f.streak_count > 0 ? <span className="ml-1.5 font-semibold text-ink-2">🔥 {f.streak_count}</span> : null}
                    {seen && !online ? <span className="ml-1.5">· {lastSeenLabel(seen)}</span> : null}
                  </>
                }
                actions={
                  <>
                    <Button
                      size="icon-sm"
                      variant="ghost"
                      aria-label={`Message ${f.display_name || f.username}`}
                      loading={openChat.isPending && openChat.variables === f.id}
                      onClick={() => openChat.mutate(f.id)}
                    >
                      {openChat.isPending && openChat.variables === f.id ? null : <MessageCircle className="h-[18px] w-[18px]" />}
                    </Button>
                    <Link
                      href={`/camera?to=${f.id}`}
                      aria-label={`Send a Snap to ${f.display_name || f.username}`}
                      className="hidden h-8 w-8 items-center justify-center rounded-full text-ink-2 hover:bg-surface-3 hover:text-ink sm:inline-flex"
                    >
                      <Camera className="h-[18px] w-[18px]" />
                    </Link>
                    <Menu
                      label={`More actions for ${f.display_name || f.username}`}
                      trigger={
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full text-ink-2 hover:bg-surface-3 hover:text-ink">
                          <MoreHorizontal className="h-[18px] w-[18px]" />
                        </span>
                      }
                      items={[
                        { label: "Message", icon: <MessageCircle />, onSelect: () => openChat.mutate(f.id) },
                        { label: "Send a Snap", icon: <Camera />, onSelect: () => router.push(`/camera?to=${f.id}`) },
                        { label: "View profile", icon: <User />, onSelect: () => router.push(`/profile/${f.username}`) },
                        { label: "Add to list", icon: <ListPlus />, onSelect: () => setListFriend(f) },
                        { label: "Remove friend", icon: <UserMinus />, danger: true, onSelect: () => void moderation.confirmUnfriend(f) },
                        { label: "Block", icon: <Ban />, danger: true, onSelect: () => void moderation.confirmBlock(f) },
                      ]}
                    />
                  </>
                }
              />
            ))}
          </AnimatePresence>
        </ul>
      )}
      <AddToListDialog friend={listFriend} onClose={() => setListFriend(null)} />
    </section>
  );
}
