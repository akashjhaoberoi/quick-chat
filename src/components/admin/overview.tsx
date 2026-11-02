"use client";

import { useQuery } from "@tanstack/react-query";
import { ErrorState } from "@/components/ui/feedback";
import { api } from "@/lib/api/client";
import { compactNumber, formatBytes, relativeTime } from "@/lib/utils";
import { DailyBarChart } from "./bar-chart";
import { HealthSummary } from "./health-summary";
import { adminKeys } from "./keys";
import { AdminPageHeader, Panel, StatCard, StatCardSkeleton } from "./ui";
import type { AdminStats } from "./types";

const n = (v: number) => (v >= 10_000 ? compactNumber(v) : v.toLocaleString());

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title}>
      <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted">{title}</h2>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">{children}</div>
    </section>
  );
}

export function AdminOverview() {
  const { data, isPending, error, refetch } = useQuery({
    queryKey: adminKeys.stats,
    queryFn: () => api.get<AdminStats>("/api/admin/stats"),
    refetchInterval: 60_000,
  });

  return (
    <div className="space-y-8">
      <AdminPageHeader title="Overview" description="Live platform metrics. Counters refresh every minute." />
      {isPending ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 12 }).map((_, i) => (
            <StatCardSkeleton key={i} />
          ))}
        </div>
      ) : error ? (
        <ErrorState description={error.message} onRetry={() => void refetch()} />
      ) : (
        <>
          <Group title="Users">
            <StatCard label="Total users" value={n(data.total_users)} href="/admin/users" />
            <StatCard label="Active" value={n(data.active_users)} />
            <StatCard label="Suspended / banned" value={n(data.suspended_users)} tone={data.suspended_users ? "warning" : undefined} />
            <StatCard label="New today" value={n(data.new_users_today)} hint={`${n(data.new_users_7d)} in the last 7 days`} />
            <StatCard label="Daily active (DAU)" value={n(data.dau)} hint="Seen in the last 24 h" />
            <StatCard label="Monthly active (MAU)" value={n(data.mau)} hint="Seen in the last 30 days" />
          </Group>
          <Group title="Activity">
            <StatCard label="Messages" value={n(data.total_messages)} hint={`${n(data.messages_24h)} in the last 24 h`} />
            <StatCard label="Active stories" value={n(data.active_stories)} hint={`${n(data.total_stories)} total`} />
            <StatCard label="Snaps sent" value={n(data.total_snaps)} />
            <StatCard label="Posts" value={n(data.total_posts)} />
            <StatCard label="Active calls" value={n(data.active_calls)} />
          </Group>
          <Group title="Storage">
            <StatCard label="Stored media" value={formatBytes(data.storage_bytes)} hint={`${n(data.storage_objects)} objects`} />
            <StatCard label="Pending deletes" value={n(data.pending_deletes)} hint="Removed by the maintenance job" />
          </Group>
          <Group title="Moderation & reliability">
            <StatCard label="Open reports" value={n(data.reports_pending)} href="/admin/reports" tone={data.reports_pending ? "warning" : undefined} />
            <StatCard label="Pending appeals" value={n(data.appeals_pending)} tone={data.appeals_pending ? "warning" : undefined} />
            <StatCard
              label="Errors (24 h)"
              value={n(data.errors_24h)}
              
              tone={data.errors_24h ? "danger" : undefined}
            />
            <StatCard
              label="Last maintenance"
              value={data.last_maintenance ? <span className="capitalize">{data.last_maintenance.status}</span> : "Never"}
              hint={data.last_maintenance?.finished_at ? relativeTime(data.last_maintenance.finished_at) : undefined}
             
              tone={data.last_maintenance?.status === "failed" ? "danger" : undefined}
            />
          </Group>
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Sign-ups" description="New accounts per day, last 30 days (UTC)">
              <DailyBarChart data={data.signups_by_day} days={30} unit="sign-ups" title="Sign-ups per day" />
            </Panel>
            <Panel title="Messages" description="Messages sent per day, last 14 days (UTC)">
              <DailyBarChart data={data.messages_by_day} days={14} unit="messages" title="Messages per day" />
            </Panel>
          </div>
        </>
      )}
      <HealthSummary />
    </div>
  );
}
