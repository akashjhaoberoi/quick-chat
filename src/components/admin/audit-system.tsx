"use client";

import { useEffect, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bug, FileClock, Play, Timer } from "lucide-react";
import { Badge } from "@/components/ui/controls";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { Input } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/ui/feedback";
import { api } from "@/lib/api/client";
import { useAdmin } from "./admin-gate";
import { HealthSummary } from "./health-summary";
import { adminKeys } from "./keys";
import { AdminPageHeader, DataTable, FilterLabel, JsonView, Pagination, Panel, Select, TableSkeleton, td, TimeCell, UserLink } from "./ui";
import { hasRole, ROLE_LABEL, type AppErrorRow, type AuditLogPage, type JobRun } from "./types";

function useDebounced(value: string, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setV(value.trim()), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function AuditLogView() {
  const [actionText, setActionText] = useState("");
  const [targetText, setTargetText] = useState("");
  const [adminId, setAdminId] = useState("");
  const [offset, setOffset] = useState(0);
  const action = useDebounced(actionText);
  const target = useDebounced(targetText);

  const { data, isPending, isFetching, error, refetch } = useQuery({
    queryKey: [...adminKeys.audit(action, adminId, offset), target],
    queryFn: () => api.get<AuditLogPage>("/api/admin/audit-logs", { action, adminId, target, offset }),
    placeholderData: keepPreviousData,
  });

  return (
    <div>
      <AdminPageHeader title="Audit log" description="Every administrative action and sensitive data access, newest first." />
      <Panel bodyClassName="p-0">
        <div className="flex flex-wrap gap-3 border-b border-border p-4">
          <FilterLabel label="Action starts with">
            <Input value={actionText} onChange={(e) => { setActionText(e.target.value); setOffset(0); }} placeholder="e.g. user. or report." className="h-10 w-56" />
          </FilterLabel>
          <FilterLabel label="Admin">
            <Select value={adminId} onChange={(e) => { setAdminId(e.target.value); setOffset(0); }}>
              <option value="">All admins</option>
              {data?.admins.map((a) => (
                <option key={a.id} value={a.id}>
                  @{a.username} ({ROLE_LABEL[a.role]})
                </option>
              ))}
            </Select>
          </FilterLabel>
          <FilterLabel label="Target ID">
            <Input value={targetText} onChange={(e) => { setTargetText(e.target.value); setOffset(0); }} placeholder="Exact ID" className="h-10 w-72 font-mono" />
          </FilterLabel>
        </div>
        {isPending ? (
          <TableSkeleton />
        ) : error ? (
          <ErrorState description={error.message} onRetry={() => void refetch()} />
        ) : data.items.length === 0 ? (
          <EmptyState icon={<FileClock />} title="No audit entries" description="Nothing matches these filters." />
        ) : (
          <div aria-busy={isFetching}>
            <DataTable caption="Audit log" head={["When", "Admin", "Action", "Target", "IP", "Details"]}>
              {data.items.map((l) => (
                <tr key={l.id} className="align-top">
                  <td className={td}>
                    <TimeCell iso={l.created_at} />
                  </td>
                  <td className={td}>
                    <UserLink user={l.admin} />
                  </td>
                  <td className={`${td} font-mono text-xs font-semibold`}>{l.action}</td>
                  <td className={`${td} text-xs`}>
                    <span className="text-muted">{l.target_type ?? "—"}</span>
                    {l.target_id ? <span className="block max-w-[14rem] truncate font-mono" title={l.target_id}>{l.target_id}</span> : null}
                  </td>
                  <td className={`${td} font-mono text-xs`}>{l.ip ?? "—"}</td>
                  <td className={td}>
                    <JsonView value={l.details} />
                  </td>
                </tr>
              ))}
            </DataTable>
          </div>
        )}
        {data ? (
          <Pagination
            offset={data.offset}
            limit={data.limit}
            count={data.items.length}
            total={data.total}
            hasMore={data.hasMore}
            onChange={setOffset}
            disabled={isFetching}
          />
        ) : null}
      </Panel>
    </div>
  );
}

function JobStatus({ status }: { status: JobRun["status"] }) {
  return <Badge tone={status === "succeeded" ? "success" : status === "failed" ? "danger" : "brand"} className="capitalize">{status}</Badge>;
}

function duration(job: JobRun) {
  if (!job.finished_at) return "—";
  const ms = new Date(job.finished_at).getTime() - new Date(job.started_at).getTime();
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

function MaintenancePanel() {
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const run = useMutation({
    mutationFn: () => api.post<{ result: Record<string, unknown> }>("/api/admin/maintenance/run"),
    onSuccess: () => {
      toast.success("Maintenance run completed");
      void queryClient.invalidateQueries({ queryKey: adminKeys.jobs });
      void queryClient.invalidateQueries({ queryKey: adminKeys.stats });
    },
  });
  return (
    <Panel
      title="Maintenance"
      description="Expires snaps and stories, deletes unreachable media, ends stale calls, lifts finished suspensions and updates streaks."
      actions={
        <Button
          size="sm"
          loading={run.isPending}
          onClick={async () => {
            const ok = await confirm({
              title: "Run maintenance now?",
              description: "The job is idempotent and safe to run at any time. The run is recorded in the audit log.",
              confirmLabel: "Run now",
            });
            if (ok) run.mutate();
          }}
        >
          <Play className="h-4 w-4" aria-hidden /> Run maintenance now
        </Button>
      }
    >
      <div className="space-y-2 text-sm text-ink-2">
        <p className="flex items-start gap-2">
          <Timer className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden />
          <span>
            <strong>pg_cron</strong> (when the extension is enabled in Supabase) runs <code className="font-mono">public.run_maintenance()</code> every
            minute as <code className="font-mono">quickchat-maintenance</code>. <strong>Vercel Cron</strong> also calls{" "}
            <code className="font-mono">/api/cron/cleanup</code> every 10 minutes (requires <code className="font-mono">CRON_SECRET</code>) as a fallback.
          </span>
        </p>
        {run.data ? <JsonView value={run.data.result} label="Result of the last manual run" /> : null}
      </div>
    </Panel>
  );
}

export function SystemView() {
  const { role } = useAdmin();
  const isAdmin = hasRole(role, "admin");
  const jobs = useQuery({ queryKey: adminKeys.jobs, queryFn: () => api.get<JobRun[]>("/api/admin/jobs"), refetchInterval: 60_000 });
  const errors = useQuery({
    queryKey: adminKeys.errors,
    queryFn: () => api.get<AppErrorRow[]>("/api/admin/errors"),
    enabled: isAdmin,
    refetchInterval: 60_000,
  });

  return (
    <div className="space-y-6">
      <AdminPageHeader title="System" description="Infrastructure health, background jobs and recorded server errors." />
      <HealthSummary />
      {isAdmin ? <MaintenancePanel /> : null}
      <Panel title="Background jobs" description="Latest 50 runs" bodyClassName="p-0">
        {jobs.isPending ? (
          <TableSkeleton rows={4} />
        ) : jobs.error ? (
          <ErrorState description={jobs.error.message} onRetry={() => void jobs.refetch()} />
        ) : jobs.data.length === 0 ? (
          <EmptyState icon={<Timer />} title="No job runs yet" description="Runs appear here once pg_cron, Vercel Cron or a manual run executes." />
        ) : (
          <DataTable caption="Background jobs" head={["Job", "Status", "Started", "Duration", "Details"]}>
            {jobs.data.map((j) => (
              <tr key={j.id} className="align-top">
                <td className={`${td} font-mono text-xs font-semibold`}>{j.job}</td>
                <td className={td}>
                  <JobStatus status={j.status} />
                </td>
                <td className={td}>
                  <TimeCell iso={j.started_at} />
                </td>
                <td className={`${td} tabular-nums`}>{duration(j)}</td>
                <td className={td}>
                  <JsonView value={j.details} />
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </Panel>
      {isAdmin ? (
        <section id="errors" className="scroll-mt-20">
          <Panel title="Application errors" description="Latest 100 unexpected server errors" bodyClassName="p-0">
            {errors.isPending ? (
              <TableSkeleton rows={4} />
            ) : errors.error ? (
              <ErrorState description={errors.error.message} onRetry={() => void errors.refetch()} />
            ) : errors.data.length === 0 ? (
              <EmptyState icon={<Bug />} title="No errors recorded" />
            ) : (
              <DataTable caption="Application errors" head={["When", "Source", "Message", "User", "Context"]}>
                {errors.data.map((e) => (
                  <tr key={e.id} className="align-top">
                    <td className={td}>
                      <TimeCell iso={e.created_at} />
                    </td>
                    <td className={`${td} font-mono text-xs`}>{e.source}</td>
                    <td className={`${td} max-w-md break-words text-sm`}>{e.message}</td>
                    <td className={`${td} font-mono text-xs`}>{e.user_id ? <a className="text-brand hover:underline" href={`/admin/users/${e.user_id}`}>{e.user_id.slice(0, 8)}…</a> : "—"}</td>
                    <td className={td}>
                      <JsonView value={e.context} />
                    </td>
                  </tr>
                ))}
              </DataTable>
            )}
          </Panel>
        </section>
      ) : null}
    </div>
  );
}
