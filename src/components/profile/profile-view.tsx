"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  BadgeCheck, Ban, CalendarDays, Crown, Camera, Check, ChevronDown, Flag, Lock, MessageCircle, MoreHorizontal, Pencil,
  Settings, Share2, TrendingUp, UserCheck, UserMinus, UserPlus, UserX, X,
} from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Badge, Menu } from "@/components/ui/controls";
import { useConfirm } from "@/components/ui/confirm";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/feedback";
import { PageContainer } from "@/components/shell/page-header";
import { useMe } from "@/components/providers/session-provider";
import { ReportDialog } from "@/components/moderation/report-dialog";
import { ProtectedImage, Watermark } from "@/components/media/protected-media";
import { SecureViewer } from "@/components/media/secure-viewer";
import { api } from "@/lib/api/client";
import { qk } from "@/lib/query-keys";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { cn, compactNumber, displayName, lastSeenLabel, mediaUrl } from "@/lib/utils";
import type { ProfileSummary, Story } from "@/types/models";
import { EditProfileDialog, MutualFriendsDialog, ScoreHistoryDialog } from "./profile-dialogs";
import { ProfileViewsCard } from "./profile-views";
import { THEME_GRADIENTS, type ProfileTheme } from "@/lib/premium-plans";

function useProfile(username: string) {
  return useQuery({
    queryKey: qk.profile(username),
    queryFn: async () => {
      const { data, error } = await getSupabaseBrowserClient().rpc("profile_summary", { p_username: username });
      if (error) throw error;
      return ((data ?? []) as ProfileSummary[])[0] ?? null;
    },
  });
}

function ProfileSkeleton() {
  return (
    <PageContainer className="pb-10" aria-busy="true">
      <Skeleton className="h-40 rounded-none md:mt-4 md:h-56 md:rounded-3xl" />
      <div className="-mt-12 px-4 md:px-6">
        <Skeleton className="h-28 w-28 rounded-full border-4 border-bg" />
        <Skeleton className="mt-4 h-7 w-48" />
        <Skeleton className="mt-2 h-4 w-32" />
        <Skeleton className="mt-5 h-16 w-full" />
      </div>
    </PageContainer>
  );
}

function Stat({ label, value, onClick }: { label: string; value: number | null; onClick?: () => void }) {
  const content = (
    <>
      <span className="block font-display text-lg font-extrabold">{value === null ? "—" : compactNumber(Number(value))}</span>
      <span className="block text-xs font-medium text-muted">{label}</span>
    </>
  );
  return onClick ? (
    <button type="button" onClick={onClick} className="rounded-2xl px-2 py-2 text-center hover:bg-surface-2">
      {content}
    </button>
  ) : (
    <div className="px-2 py-2 text-center">{content}</div>
  );
}

export function ProfileView() {
  const params = useParams<{ username: string }>();
  const username = decodeURIComponent(params.username ?? "").toLowerCase();
  const me = useMe();
  const router = useRouter();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const profile = useProfile(username);
  const p = profile.data;
  const isMe = p?.id === me.user.id;
  const [editing, setEditing] = useState(false);
  const [scoreOpen, setScoreOpen] = useState(false);
  const [mutualOpen, setMutualOpen] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [blocked, setBlocked] = useState<{ id: string; name: string } | null>(null);
  const [viewing, setViewing] = useState<{ src: string; label: string } | null>(null);
  const [coverFailed, setCoverFailed] = useState(false);

  const premium = useQuery({
    queryKey: ["profile-premium", p?.id],
    enabled: Boolean(p?.id),
    queryFn: async () => {
      const { data, error } = await getSupabaseBrowserClient().rpc("profile_premium", { p_user: p!.id });
      if (error) return { premium: false, theme: "default" as ProfileTheme };
      return ((data ?? []) as { premium: boolean; theme: ProfileTheme }[])[0] ?? { premium: false, theme: "default" as ProfileTheme };
    },
    staleTime: 60_000,
  });
  const theme = premium.data?.theme ?? "default";

  const stories = useQuery({
    queryKey: qk.userStories(p?.id ?? ""),
    enabled: Boolean(p?.id),
    meta: { silent: true },
    queryFn: async () => {
      const { data, error } = await getSupabaseBrowserClient().rpc("user_stories", { p_user_id: p!.id });
      if (error) throw error;
      return (data ?? []) as Story[];
    },
  });
  const storyList = stories.data ?? [];
  const ring = storyList.length ? (storyList.some((s) => !s.viewed) && !isMe ? "unseen" : isMe ? "unseen" : "seen") : null;

  useEffect(() => {
    if (p) document.title = `${displayName(p)} (@${p.username}) · Quick Chat`;
  }, [p]);

  // Count a visit to someone else's profile (the server ignores repeats within
  // 24 h). Automated browsers report navigator.webdriver and aren't counted.
  const viewedId = p && !isMe ? p.id : null;
  useEffect(() => {
    if (!viewedId || navigator.webdriver) return;
    void api.post("/api/profile-views", { profileId: viewedId }).catch(() => undefined);
  }, [viewedId]);

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: qk.profile(username) }),
      queryClient.invalidateQueries({ queryKey: qk.friends }),
      queryClient.invalidateQueries({ queryKey: qk.friendRequests }),
    ]);

  const action = useMutation({
    mutationFn: async (kind: "add" | "cancel" | "accept" | "reject" | "unfriend" | "follow" | "block" | "unblock") => {
      if (!p && kind !== "unblock") return null;
      switch (kind) {
        case "add":
          return api.post<{ status: string }>("/api/friends/requests", { userId: p!.id });
        case "cancel":
          return api.delete(`/api/friends/requests/${p!.request_id}`);
        case "accept":
        case "reject":
          return api.post(`/api/friends/requests/${p!.request_id}`, { action: kind });
        case "unfriend":
          return api.delete(`/api/friends/${p!.id}`);
        case "follow":
          return api.post<{ following: boolean }>(`/api/users/${p!.id}/follow`);
        case "block":
          return api.post(`/api/users/${p!.id}/block`);
        case "unblock":
          return api.delete(`/api/users/${blocked!.id}/block`);
      }
    },
    onSuccess: async (data, kind) => {
      const status = (data as { status?: string } | null)?.status;
      if (kind === "add") toast.success(status === "accepted" ? "You're now friends!" : status === "already_friends" ? "You're already friends" : "Friend request sent");
      if (kind === "accept") toast.success("Friend request accepted");
      if (kind === "unfriend") toast.success("Removed from friends");
      if (kind === "follow") toast.success((data as { following?: boolean }).following ? "Following" : "Unfollowed");
      if (kind === "block") {
        setBlocked({ id: p!.id, name: displayName(p) });
        void queryClient.invalidateQueries({ queryKey: qk.blocked });
        toast.success("Blocked");
        return;
      }
      if (kind === "unblock") {
        setBlocked(null);
        void queryClient.invalidateQueries({ queryKey: qk.blocked });
        toast.success("Unblocked");
      }
      await refresh();
    },
  });

  const message = useMutation({
    mutationFn: () => api.post<{ id: string }>("/api/conversations", { type: "direct", userId: p!.id }),
    onSuccess: (c) => router.push(`/chats/${c.id}`),
  });

  if (blocked) {
    return (
      <PageContainer>
        <EmptyState
          icon={<Ban />}
          title={`You blocked ${blocked.name}`}
          description="They can't find your profile, message you, or see your Stories. They aren't notified."
          action={
            <Button variant="outline" loading={action.isPending} onClick={() => action.mutate("unblock")}>
              Unblock
            </Button>
          }
        />
      </PageContainer>
    );
  }
  if (profile.isPending) return <ProfileSkeleton />;
  if (profile.isError) return <ErrorState className="mt-10" onRetry={() => void profile.refetch()} />;
  if (!p) {
    return (
      <PageContainer>
        <EmptyState
          icon={<UserX />}
          title="User not found"
          description={`@${username} doesn't exist, is unavailable, or one of you has blocked the other.`}
          action={
            <div className="flex flex-wrap justify-center gap-3 text-sm font-semibold">
              <Link href="/search" className="text-brand hover:underline">Search people</Link>
              <Link href="/settings/blocked" className="text-muted hover:text-ink">Manage blocked accounts</Link>
            </div>
          }
        />
      </PageContainer>
    );
  }

  const name = displayName(p);
  const locked = !p.can_view_details;
  const canFollow = !isMe && (!p.is_private || p.is_friend);
  const lastSeen = !isMe ? lastSeenLabel(p.last_seen_at) : null;
  const busy = action.isPending;
  const coverSrc = !coverFailed ? mediaUrl(p.cover_media_id) : undefined;
  // Watermark other people's photos when their owner asked for it.
  const marked = !isMe && p.media_watermark !== false;

  const share = async () => {
    const url = `${window.location.origin}/profile/${p.username}`;
    try {
      if (navigator.share) await navigator.share({ title: `${name} on Quick Chat`, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success("Profile link copied");
      }
    } catch {
      // share sheet dismissed
    }
  };

  const avatarEl = <Avatar mediaId={p.avatar_media_id} name={name} size="2xl" ring={ring} />;
  const photoSrc = mediaUrl(p.avatar_media_id);

  return (
    <PageContainer className="pb-10">
      <div className="relative h-40 overflow-hidden bg-surface-2 md:mt-4 md:h-56 md:rounded-3xl">
        {coverSrc ? (
          <button type="button" className="block h-full w-full" onClick={() => setViewing({ src: coverSrc, label: `${name}'s cover photo` })} aria-label="View cover photo">
            <ProtectedImage src={coverSrc} className="h-full w-full" imgClassName="h-full w-full object-cover" onError={() => setCoverFailed(true)}>
              {marked ? <Watermark compact /> : null}
            </ProtectedImage>
          </button>
        ) : (
          <div
            className="brand-gradient h-full w-full opacity-90"
            style={theme !== "default" ? { background: THEME_GRADIENTS[theme] } : undefined}
            data-profile-theme={theme}
          />
        )}
      </div>
      {viewing ? <SecureViewer items={[{ src: viewing.src, kind: "image" }]} label={viewing.label} notice="Protected photo" watermark={marked} onClose={() => setViewing(null)} /> : null}

      <div className="px-4 md:px-6">
        <div className="-mt-14 flex items-end justify-between gap-3">
          <div className="rounded-full bg-bg p-1">
            {storyList.length ? (
              <Link href={`/stories/view/${p.id}`} aria-label={`View ${name}'s story`} className="block rounded-full">
                {avatarEl}
              </Link>
            ) : photoSrc ? (
              <button type="button" className="block rounded-full" onClick={() => setViewing({ src: photoSrc, label: `${name}'s profile photo` })} aria-label="View profile photo">
                {avatarEl}
              </button>
            ) : (
              avatarEl
            )}
          </div>
          {isMe ? (
            <div className="flex gap-2 pb-1">
              <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                <Pencil className="h-4 w-4" /> Edit profile
              </Button>
              <Button variant="ghost" size="icon-sm" onClick={() => void share()} aria-label="Share profile">
                <Share2 className="h-4 w-4" />
              </Button>
              <Link href="/settings" className="inline-flex h-8 w-8 items-center justify-center rounded-full text-ink-2 hover:bg-surface-2" aria-label="Settings">
                <Settings className="h-4 w-4" />
              </Link>
            </div>
          ) : null}
        </div>

        <div className="mt-3">
          <h1 className="flex items-center gap-1.5 font-display text-2xl font-extrabold tracking-tight">
            <span className="truncate">{name}</span>
            {p.is_verified ? <BadgeCheck className="h-5 w-5 shrink-0 text-brand" aria-label="Verified" /> : null}
            {premium.data?.premium ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-soft px-2 py-0.5 text-[11px] font-bold text-ink" title="Quick Chat Premium">
                <Crown className="h-3.5 w-3.5 text-brand" aria-hidden /> Premium
              </span>
            ) : null}
          </h1>
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
            <span>@{p.username}</span>
            {p.is_creator ? <Badge>Creator</Badge> : null}
            {p.is_private ? (
              <Badge tone="muted">
                <Lock className="mr-1 h-3 w-3" /> Private
              </Badge>
            ) : null}
            {p.is_friend ? <Badge tone="success">Friend</Badge> : null}
            {lastSeen ? <span className={cn(lastSeen === "Online" && "font-semibold text-success")}>· {lastSeen}</span> : null}
          </p>
          {p.bio ? <p className="mt-3 whitespace-pre-line text-[15px] text-ink-2">{p.bio}</p> : null}
          <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5" /> Joined {format(new Date(p.created_at), "MMMM yyyy")}
            </span>
            {!isMe && Number(p.mutual_count) > 0 ? (
              <button type="button" onClick={() => setMutualOpen(true)} className="font-semibold text-ink-2 hover:text-brand">
                {p.mutual_count} mutual friend{Number(p.mutual_count) === 1 ? "" : "s"}
              </button>
            ) : null}
          </p>
        </div>

        {!isMe ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {p.is_friend ? (
              <Menu
                label="Friendship options"
                align="start"
                trigger={
                  <span className="inline-flex h-10 items-center gap-2 rounded-xl bg-surface-2 px-4 text-sm font-semibold hover:bg-surface-3">
                    <UserCheck className="h-4 w-4" /> Friends <ChevronDown className="h-3.5 w-3.5" />
                  </span>
                }
                items={[
                  {
                    label: "Unfriend",
                    icon: <UserMinus />,
                    danger: true,
                    onSelect: async () => {
                      if (await confirm({ title: `Remove ${name}?`, description: "You'll stop being friends and any streak will end.", confirmLabel: "Unfriend", danger: true })) {
                        action.mutate("unfriend");
                      }
                    },
                  },
                ]}
              />
            ) : p.request_status === "outgoing" ? (
              <Button variant="secondary" loading={busy} onClick={() => action.mutate("cancel")} title="Cancel friend request">
                <X className="h-4 w-4" /> Requested
              </Button>
            ) : p.request_status === "incoming" ? (
              <>
                <Button variant="gradient" loading={busy} onClick={() => action.mutate("accept")}>
                  <Check className="h-4 w-4" /> Accept
                </Button>
                <Button variant="secondary" disabled={busy} onClick={() => action.mutate("reject")}>
                  Decline
                </Button>
              </>
            ) : (
              <Button variant="gradient" loading={busy} onClick={() => action.mutate("add")}>
                <UserPlus className="h-4 w-4" /> Add friend
              </Button>
            )}
            <Button variant="outline" loading={message.isPending} onClick={() => message.mutate()}>
              <MessageCircle className="h-4 w-4" /> Message
            </Button>
            {canFollow ? (
              <Button variant={p.is_following ? "secondary" : "outline"} disabled={busy} onClick={() => action.mutate("follow")}>
                {p.is_following ? "Following" : "Follow"}
              </Button>
            ) : null}
            {p.is_friend ? (
              <Link href={`/camera?to=${p.id}`} className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-semibold hover:bg-surface-2">
                <Camera className="h-4 w-4" /> Send Snap
              </Link>
            ) : null}
            <Menu
              label="More options"
              trigger={
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface hover:bg-surface-2">
                  <MoreHorizontal className="h-4 w-4" />
                </span>
              }
              items={[
                { label: "Share profile", icon: <Share2 />, onSelect: () => void share() },
                { label: "Report", icon: <Flag />, onSelect: () => setReporting(true) },
                {
                  label: "Block",
                  icon: <Ban />,
                  danger: true,
                  onSelect: async () => {
                    if (
                      await confirm({
                        title: `Block ${name}?`,
                        description: "They won't be able to find your profile, message or call you, or see your Stories. You'll also stop being friends. They won't be notified.",
                        confirmLabel: "Block",
                        danger: true,
                      })
                    ) {
                      action.mutate("block");
                    }
                  },
                },
              ]}
            />
          </div>
        ) : null}

        <div className="mt-5 grid grid-cols-4 rounded-3xl border border-border bg-surface p-1 shadow-[var(--shadow-soft)]">
          <Stat label="Friends" value={p.friend_count} />
          <Stat label="Followers" value={p.follower_count} />
          <Stat label="Following" value={p.following_count} />
          <Stat label="Posts" value={p.post_count} />
        </div>

        {isMe ? <ProfileViewsCard /> : null}

        {p.score !== null ? (
          <div className="mt-3 flex items-center justify-between rounded-3xl border border-border bg-surface px-4 py-3">
            <span className="flex items-center gap-3">
              <span className="brand-gradient flex h-10 w-10 items-center justify-center rounded-2xl text-white">
                <TrendingUp className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-xs font-semibold text-muted">Snap score</span>
                <span className="block font-display text-lg font-extrabold">{Number(p.score).toLocaleString()}</span>
              </span>
            </span>
            {isMe ? (
              <Button variant="ghost" size="sm" onClick={() => setScoreOpen(true)}>
                History
              </Button>
            ) : null}
          </div>
        ) : null}

        {locked ? (
          <div className="mt-6 rounded-3xl border border-dashed border-border bg-surface-2 p-8 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-surface text-ink-2">
              <Lock className="h-7 w-7" />
            </span>
            <h2 className="mt-3 font-display text-lg font-bold">This account is private</h2>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted">Become friends with @{p.username} to see their friends, posts and more.</p>
          </div>
        ) : null}
      </div>

      {isMe ? (
        <>
          {editing ? <EditProfileDialog open={editing} onClose={() => setEditing(false)} profile={me.profile} /> : null}
          <ScoreHistoryDialog open={scoreOpen} onClose={() => setScoreOpen(false)} score={p.score} />
        </>
      ) : (
        <>
          <MutualFriendsDialog open={mutualOpen} onClose={() => setMutualOpen(false)} userId={p.id} name={name} />
          <ReportDialog open={reporting} onClose={() => setReporting(false)} targetType="user" targetId={p.id} targetLabel={`@${p.username}`} />
        </>
      )}
    </PageContainer>
  );
}

/** /profile → /profile/{own username}. */
export function OwnProfileRedirect() {
  const me = useMe();
  const router = useRouter();
  useEffect(() => {
    router.replace(`/profile/${me.profile.username}`);
  }, [me.profile.username, router]);
  return <ProfileSkeleton />;
}
