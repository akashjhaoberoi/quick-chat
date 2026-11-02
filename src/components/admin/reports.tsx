"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, CheckCircle2, Flag, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/input";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/ui/feedback";
import { api } from "@/lib/api/client";
import { ModerationDialog, type ModerationRequest } from "./action-dialog";
import { useAdmin } from "./admin-gate";
import { adminKeys } from "./keys";
import {
  AdminPageHeader, DataTable, FilterLabel, fullDate, KeyValue, MediaPreview, Pagination, Panel, ReportStatusBadge, Select,
  TableSkeleton, td, TimeCell, UserLink,
} from "./ui";
import {
  ACTION_LABEL, hasRole, reasonLabel, REPORT_REASONS, REPORT_TARGETS, type Page, type ReportDetail, type ReportRow,
  type ReportSnapshot,
} from "./types";

function snapshotExcerpt(r: Pick<ReportRow, "target_type" | "snapshot">): string {
  const s = r.snapshot ?? {};
  const text = s.body ?? s.caption ?? s.bio ?? s.name ?? (s.username ? `@${s.username}` : "");
  return typeof text === "string" && text ? text : `(${r.target_type})`;
}

export function ReportsQueue() {
  const [status, setStatus] = useState("open");
  const [type, setType] = useState("");
  const [reason, setReason] = useState("");
  const [offset, setOffset] = useState(0);
  const filters = { status, type, reason, offset };
  const { data, isPending, isFetching, error, refetch } = useQuery({
    queryKey: adminKeys.reports(filters),
    queryFn: () => api.get<Page<ReportRow>>("/api/admin/reports", filters),
    placeholderData: keepPreviousData,
  });
  const set = (fn: (v: string) => void) => (e: React.ChangeEvent<HTMLSelectElement>) => {
    fn(e.target.value);
    setOffset(0);
  };

  return (
    <div>
      <AdminPageHeader
        title="Reports"
        description="Open reports are listed oldest first. Moderators only see the reported item as it was captured at report time — never the surrounding conversation."
      />
      <Panel bodyClassName="p-0">
        <div className="flex flex-wrap gap-3 border-b border-border p-4">
          <FilterLabel label="Status">
            <Select value={status} onChange={set(setStatus)}>
              <option value="open">Open (pending + reviewing)</option>
              <option value="pending">Pending</option>
              <option value="reviewing">Reviewing</option>
              <option value="actioned">Actioned</option>
              <option value="dismissed">Dismissed</option>
              <option value="all">All</option>
            </Select>
          </FilterLabel>
          <FilterLabel label="Target type">
            <Select value={type} onChange={set(setType)}>
              <option value="">All types</option>
              {REPORT_TARGETS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </FilterLabel>
          <FilterLabel label="Reason">
            <Select value={reason} onChange={set(setReason)}>
              <option value="">All reasons</option>
              {REPORT_REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </Select>
          </FilterLabel>
        </div>
        {isPending ? (
          <TableSkeleton />
        ) : error ? (
          <ErrorState description={error.message} onRetry={() => void refetch()} />
        ) : data.items.length === 0 ? (
          <EmptyState icon={<CheckCircle2 />} title="Queue is clear" description="No reports match these filters." />
        ) : (
          <div aria-busy={isFetching}>
            <DataTable caption="Reports" head={["Reason", "Content", "Reported user", "Reporter", "Status", "Filed"]}>
              {data.items.map((r) => (
                <tr key={r.id} className="hover:bg-surface-2/60">
                  <td className={td}>
                    <Link href={`/admin/reports/${r.id}`} className="font-semibold hover:text-brand hover:underline">
                      {reasonLabel(r.reason)}
                    </Link>
                    <span className="block text-xs capitalize text-muted">{r.target_type}</span>
                  </td>
                  <td className={`${td} max-w-xs`}>
                    <span className="line-clamp-2 break-words text-ink-2">{snapshotExcerpt(r)}</span>
                  </td>
                  <td className={td}>
                    <UserLink user={r.target_user} />
                  </td>
                  <td className={td}>
                    <UserLink user={r.reporter} />
                  </td>
                  <td className={td}>
                    <ReportStatusBadge status={r.status} />
                  </td>
                  <td className={td}>
                    <TimeCell iso={r.created_at} />
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

function SnapshotView({ type, s }: { type: string; s: ReportSnapshot }) {
  const media = (s.media_ids ?? []).filter((m): m is string => Boolean(m));
  const rows: { label: string; value: React.ReactNode }[] = [];
  if (type === "message") {
    rows.push({ label: "Message type", value: s.type ?? "—" }, { label: "Sent", value: fullDate(s.sent_at) });
  } else if (type === "user") {
    rows.push({ label: "Username", value: s.username ? `@${s.username}` : "—" }, { label: "Display name", value: s.display_name || "—" });
  } else if (type === "group") {
    rows.push({ label: "Group name", value: s.name || "—" }, { label: "Description", value: s.description || "—" });
  } else {
    rows.push({ label: "Posted", value: fullDate(s.posted_at) });
    if (s.media_kind) rows.push({ label: "Media", value: s.media_kind });
    if (s.post_id) rows.push({ label: "On post", value: <span className="font-mono text-xs">{s.post_id}</span> });
  }
  const text = s.body ?? s.caption ?? s.bio;
  return (
    <div className="space-y-4">
      {text ? (
        <blockquote className="whitespace-pre-wrap break-words rounded-xl border-l-4 border-brand bg-surface-2 p-3 text-sm">{text}</blockquote>
      ) : null}
      <KeyValue items={rows} />
      {s.metadata && Object.keys(s.metadata).length ? (
        <details>
          <summary className="cursor-pointer text-xs font-semibold text-brand">Message metadata</summary>
          <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-surface-2 p-3 font-mono text-[11px]">
            {JSON.stringify(s.metadata, null, 2)}
          </pre>
        </details>
      ) : null}
      {media.length ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {media.map((m) => (
            <MediaPreview key={m} mediaId={m} kind={s.media_kind ?? (s.type === "video" ? "video" : "image")} className="aspect-square w-full" alt="Reported media" />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function ReportDetailView() {
  const { id } = useParams<{ id: string }>();
  const admin = useAdmin();
  const queryClient = useQueryClient();
  const [request, setRequest] = useState<ModerationRequest | null>(null);
  const [resolveOpen, setResolveOpen] = useState<"dismissed" | "actioned" | null>(null);
  const [note, setNote] = useState("");
  const { data, isPending, error, refetch } = useQuery({
    queryKey: adminKeys.report(id),
    queryFn: () => api.get<ReportDetail>(`/api/admin/reports/${id}`),
  });
  const resolve = useMutation({
    mutationFn: (v: { resolution: "reviewing" | "actioned" | "dismissed"; note?: string }) =>
      api.post(`/api/admin/reports/${id}/resolve`, v),
    onSuccess: (_d, v) => {
      toast.success(v.resolution === "reviewing" ? "Marked as reviewing" : `Report ${v.resolution}`);
      setResolveOpen(null);
      setNote("");
      void queryClient.invalidateQueries({ queryKey: adminKeys.all });
    },
  });

  if (isPending) return <ListSkeleton rows={5} />;
  if (error) return <ErrorState description={error.message} onRetry={() => void refetch()} />;

  const { report: r, contentState, ownerHistory } = data;
  const open = r.status === "pending" || r.status === "reviewing";
  const owner = r.target_user;
  const ownerLabel = owner ? `@${owner.username}` : undefined;
  const removable = ["story", "post", "comment", "message", "group"].includes(r.target_type);
  const contentTarget = removable ? { type: r.target_type as "story" | "post" | "comment" | "message" | "group", id: r.target_id } : null;
  const ownerIsSelf = owner?.id === admin.userId;

  return (
    <div className="space-y-6">
      <Link href="/admin/reports" className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden /> Reports queue
      </Link>
      <AdminPageHeader
        title={`${reasonLabel(r.reason)} · ${r.target_type}`}
        description={`Filed ${fullDate(r.created_at)}`}
        actions={<ReportStatusBadge status={r.status} />}
      />
      <p className="flex items-start gap-2 rounded-2xl border border-border bg-brand-soft p-3 text-sm text-ink-2">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand" aria-hidden />
        You are viewing a snapshot of only the reported item, captured by the server when the report was filed. Moderators never get
        access to the rest of a private conversation.
      </p>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Panel
            title="Reported content (snapshot)"
            description={contentState ? `Current state: ${contentState.label}` : undefined}
          >
            <SnapshotView type={r.target_type} s={r.snapshot ?? {}} />
          </Panel>
          <Panel title="Reporter's note">
            <p className="whitespace-pre-wrap break-words text-sm">{r.details || <span className="text-muted">No details given.</span>}</p>
          </Panel>
          <Panel title="Other reports on this target" bodyClassName="p-0">
            {data.related.length === 0 ? (
              <EmptyState icon={<Flag />} title="No other reports" />
            ) : (
              <DataTable caption="Other reports on this target" head={["Reason", "Reporter", "Status", "Filed"]}>
                {data.related.map((x) => (
                  <tr key={x.id}>
                    <td className={td}>
                      <Link href={`/admin/reports/${x.id}`} className="font-semibold hover:text-brand hover:underline">
                        {reasonLabel(x.reason)}
                      </Link>
                    </td>
                    <td className={td}>
                      <UserLink user={x.reporter} />
                    </td>
                    <td className={td}>
                      <ReportStatusBadge status={x.status} />
                    </td>
                    <td className={td}>
                      <TimeCell iso={x.created_at} />
                    </td>
                  </tr>
                ))}
              </DataTable>
            )}
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="People">
            <div className="space-y-4">
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Reported user</p>
                <UserLink user={owner} showPublic />
                {owner ? (
                  <p className="mt-1 text-xs text-muted">
                    History: {ownerHistory.warn} warnings · {ownerHistory.suspend} suspensions · {ownerHistory.ban} bans ·{" "}
                    {ownerHistory.remove_content} removals
                  </p>
                ) : null}
              </div>
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Reporter</p>
                <UserLink user={r.reporter} showPublic />
              </div>
              {r.resolver ? (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Resolved by</p>
                  <UserLink user={r.resolver} sub={fullDate(r.resolved_at)} />
                  {r.resolution_note ? <p className="mt-1 text-sm">{r.resolution_note}</p> : null}
                </div>
              ) : null}
            </div>
          </Panel>

          <Panel title="Actions">
            <div className="flex flex-col gap-2">
              {r.status === "pending" ? (
                <Button variant="outline" loading={resolve.isPending && resolve.variables?.resolution === "reviewing"} onClick={() => resolve.mutate({ resolution: "reviewing" })}>
                  Mark as reviewing
                </Button>
              ) : null}
              {contentTarget && contentState?.status !== "removed" && contentState?.status !== "deleted" ? (
                <Button variant="danger" onClick={() => setRequest({ kind: "remove_content", target: contentTarget, reportId: r.id })}>
                  Remove content
                </Button>
              ) : null}
              {owner && !ownerIsSelf ? (
                <>
                  <Button variant="outline" onClick={() => setRequest({ kind: "warn", userId: owner.id, userLabel: ownerLabel, reportId: r.id })}>
                    Warn owner
                  </Button>
                  <Button variant="outline" onClick={() => setRequest({ kind: "suspend", userId: owner.id, userLabel: ownerLabel, reportId: r.id })}>
                    Suspend owner
                  </Button>
                  {hasRole(admin.role, "admin") ? (
                    <Button variant="danger" onClick={() => setRequest({ kind: "ban", userId: owner.id, userLabel: ownerLabel, reportId: r.id })}>
                      Ban owner
                    </Button>
                  ) : null}
                </>
              ) : null}
              {open ? (
                <div className="mt-2 grid grid-cols-2 gap-2 border-t border-border pt-3">
                  <Button variant="secondary" onClick={() => setResolveOpen("dismissed")}>
                    Dismiss
                  </Button>
                  <Button onClick={() => setResolveOpen("actioned")}>Resolve as actioned</Button>
                </div>
              ) : (
                <p className="text-sm text-muted">This report is closed.</p>
              )}
            </div>
          </Panel>

          <Panel title="Actions taken on this report" bodyClassName={data.actions.length ? "p-0" : undefined}>
            {data.actions.length === 0 ? (
              <p className="text-sm text-muted">None yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {data.actions.map((a) => (
                  <li key={a.id} className="px-4 py-3 text-sm">
                    <span className="font-semibold">{ACTION_LABEL[a.action]}</span>
                    <span className="text-muted"> · {a.moderator ? `@${a.moderator.username}` : "—"} · </span>
                    <TimeCell iso={a.created_at} />
                    {a.reason ? <p className="mt-1 break-words text-ink-2">{a.reason}</p> : null}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <ModerationDialog
        request={request}
        onClose={() => setRequest(null)}
        onDone={() => {
          if (open) setResolveOpen("actioned");
        }}
      />
      <Dialog
        open={resolveOpen !== null}
        onClose={() => setResolveOpen(null)}
        title={resolveOpen === "dismissed" ? "Dismiss report" : "Resolve as actioned"}
        description={resolveOpen === "dismissed" ? "No violation found. The note is recorded in the audit log." : "Close the report after taking action."}
        footer={
          <>
            <Button variant="ghost" onClick={() => setResolveOpen(null)}>
              Cancel
            </Button>
            <Button
              loading={resolve.isPending}
              disabled={resolveOpen === "dismissed" && note.trim().length < 3}
              onClick={() => resolveOpen && resolve.mutate({ resolution: resolveOpen, note })}
            >
              {resolveOpen === "dismissed" ? "Dismiss report" : "Resolve"}
            </Button>
          </>
        }
      >
        <Field label={resolveOpen === "dismissed" ? "Note (required)" : "Note (optional)"}>
          {(p) => <Textarea {...p} data-autofocus value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} />}
        </Field>
      </Dialog>
    </div>
  );
}
