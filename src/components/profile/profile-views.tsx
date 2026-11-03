"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { BadgeCheck, Ban, Eye, EyeOff, Flag, MessageCircle, MoreHorizontal, UserPlus, UserRound } from "lucide-react";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Menu } from "@/components/ui/controls";
import { useConfirm } from "@/components/ui/confirm";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/ui/feedback";
import { PageContainer, PageHeader } from "@/components/shell/page-header";
import { useMe } from "@/components/providers/session-provider";
import { ReportDialog } from "@/components/moderation/report-dialog";
import { api, errorMessage } from "@/lib/api/client";
import { compactNumber, displayName, isOnline, lastSeenLabel, relativeTime } from "@/lib/utils";
import type { ProfileViewStats, ProfileVisitor } from "@/types/models";

type ViewsPage = { views: ProfileVisitor[]; stats: ProfileViewStats };
const VIEWS_KEY = ["profile-views"] as const;

export function useProfileViews() {
  return useQuery({ queryKey: VIEWS_KEY, queryFn: () => api.get<ViewsPage>("/api/profile-views"), staleTime: 30_000 });
}

/** Own-profile card: unique visitors and a link to the full list. */
export function ProfileViewsCard() {
  const views = useProfileViews();
  const stats = views.data?.stats;
  return (
    <Link
      href="/profile-views"
      className="mt-4 flex items-center gap-3 rounded-2xl border border-border bg-surface p-3 transition-colors hover:bg-surface-2"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[#fff4e5] text-[#f79009] dark:bg-[#f79009]/15">
        <Eye className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">Who viewed your profile</span>
        <span className="block text-xs text-muted">
          {stats ? `${compactNumber(stats.unique_visitors)} unique visitor${stats.unique_visitors === 1 ? "" : "s"} · ${stats.unique_visitors_7d} this week` : "See your recent visitors"}
        </span>
      </span>
    </Link>
  );
}

function VisitorRow({ v }: { v: ProfileVisitor }) {
  const router = useRouter();
  const confirm = useConfirm();
  const qc = useQueryClient();
  const [reporting, setReporting] = useState(false);
  const when = `${format(new Date(v.viewed_at), "d MMM yyyy, HH:mm")} · ${relativeTime(v.viewed_at)}`;

  const action = useMutation({
    mutationFn: async (kind: "add" | "message" | "block") => {
      if (kind === "add") return api.post("/api/friends/requests", { userId: v.id });
      if (kind === "block") return api.post(`/api/users/${v.id}/block`);
      const c = await api.post<{ id: string }>("/api/conversations", { type: "direct", userId: v.id });
      router.push(`/chats/${c.id}`);
    },
    onSuccess: (_d, kind) => {
      if (kind === "add") toast.success("Friend request sent");
      if (kind === "block") {
        toast.success("Blocked");
        void qc.invalidateQueries({ queryKey: VIEWS_KEY });
      }
    },
    onError: (err) => toast.error(errorMessage(err)),
  });

  if (v.anonymous || !v.id || !v.username) {
    return (
      <li className="flex items-center gap-3 py-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-3 text-muted">
          <EyeOff className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">Someone viewed your profile</span>
          <span className="block text-xs text-muted">Anonymous · {when}</span>
        </span>
      </li>
    );
  }

  const name = displayName(v);
  const seen = lastSeenLabel(v.last_seen_at);
  return (
    <li className="flex items-center gap-3 py-3">
      <Link href={`/profile/${v.username}`} className="shrink-0" aria-label={`Open ${name}'s profile`}>
        <Avatar mediaId={v.avatar_media_id} name={name} online={isOnline(v.last_seen_at)} />
      </Link>
      <Link href={`/profile/${v.username}`} className="min-w-0 flex-1">
        <span className="flex items-center gap-1 text-sm font-semibold">
          <span className="truncate">{name}</span>
          {v.is_verified ? <BadgeCheck className="h-4 w-4 shrink-0 text-[#f79009]" aria-label="Verified" /> : null}
        </span>
        <span className="block truncate text-xs text-muted">
          @{v.username}
          {seen ? ` · ${seen}` : ""}
        </span>
        <span className="block truncate text-xs text-muted">Viewed {when}</span>
      </Link>
      {!v.is_friend ? (
        <Button size="sm" variant="outline" loading={action.isPending && action.variables === "add"} onClick={() => action.mutate("add")}>
          <UserPlus className="h-4 w-4" /> Add
        </Button>
      ) : null}
      <Menu
        label={`Actions for ${name}`}
        trigger={<MoreHorizontal className="h-5 w-5" />}
        items={[
          { label: "View profile", icon: <UserRound />, onSelect: () => router.push(`/profile/${v.username}`) },
          { label: "Message", icon: <MessageCircle />, onSelect: () => action.mutate("message") },
          { label: "Report", icon: <Flag />, onSelect: () => setReporting(true) },
          {
            label: "Block",
            icon: <Ban />,
            danger: true,
            onSelect: async () => {
              if (await confirm({ title: `Block ${name}?`, description: "You won't see each other anywhere on Quick Chat.", confirmLabel: "Block", danger: true })) {
                action.mutate("block");
              }
            },
          },
        ]}
      />
      <ReportDialog open={reporting} onClose={() => setReporting(false)} targetType="user" targetId={v.id} targetLabel={`@${v.username}`} />
    </li>
  );
}

/** /profile-views — who viewed my profile. */
export function ProfileViewsPage() {
  const me = useMe();
  const views = useProfileViews();
  const tracking = me.settings.profile_view_tracking !== false;
  const stats = views.data?.stats;

  return (
    <PageContainer className="pb-10">
      <PageHeader title="Who viewed your profile" subtitle="Visits from the last time each person viewed it" back={`/profile/${me.profile.username}`} />
      <div className="space-y-4 px-4 md:px-6">
        {!tracking ? (
          <p className="rounded-2xl bg-surface-2 p-3 text-sm text-ink-2">
            Profile view tracking is off, so new visits aren&apos;t recorded.{" "}
            <Link href="/settings/privacy" className="font-semibold text-brand hover:underline">
              Turn it on
            </Link>
          </p>
        ) : null}
        <div className="grid grid-cols-3 gap-2">
          {[
            ["Unique visitors", stats?.unique_visitors],
            ["This week", stats?.unique_visitors_7d],
            ["Total views", stats?.total_views],
          ].map(([label, value]) => (
            <div key={label as string} className="rounded-2xl border border-border bg-surface p-3 text-center">
              <span className="block font-display text-lg font-extrabold">{value === undefined ? "—" : compactNumber(Number(value))}</span>
              <span className="block text-xs font-medium text-muted">{label}</span>
            </div>
          ))}
        </div>
        <section aria-label="Recent visitors" className="rounded-3xl border border-border bg-surface px-4">
          {views.isPending ? (
            <ListSkeleton rows={5} />
          ) : views.isError ? (
            <ErrorState onRetry={() => void views.refetch()} />
          ) : views.data.views.length === 0 ? (
            <EmptyState icon={<Eye />} title="No profile views yet" description="When someone visits your profile, they'll show up here." />
          ) : (
            <ul className="divide-y divide-border">
              {views.data.views.map((v) => (
                <VisitorRow key={v.view_id} v={v} />
              ))}
            </ul>
          )}
        </section>
        <p className="text-xs text-muted">
          People who chose anonymous viewing are counted but not shown. Control your own visibility in{" "}
          <Link href="/settings/privacy" className="font-semibold text-brand hover:underline">
            Privacy settings
          </Link>
          .
        </p>
      </div>
    </PageContainer>
  );
}
