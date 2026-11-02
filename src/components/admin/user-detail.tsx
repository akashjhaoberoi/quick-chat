"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, Ban, Eye, History, RotateCcw, ShieldCheck, Timer } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm";
import { EmptyState, ErrorState, ListSkeleton } from "@/components/ui/feedback";
import { api } from "@/lib/api/client";
import { displayName } from "@/lib/utils";
import { ModerationDialog, type ModerationRequest } from "./action-dialog";
import { useAdmin } from "./admin-gate";
import { adminKeys } from "./keys";
import {
  DataTable, fullDate, KeyValue, Panel, ReportStatusBadge, RoleBadge, Select, td, TimeCell, UserLink, UserStatusBadge,
} from "./ui";
import { ACTION_LABEL, hasRole, reasonLabel, ROLE_LABEL, type AdminRole, type UserDetail as Detail, type UserSession } from "./types";

function LoginActivity({ userId }: { userId: string }) {
  const [enabled, setEnabled] = useState(false);
  const { data, isPending, error, refetch } = useQuery({
    queryKey: adminKeys.sessions(userId),
    queryFn: () => api.get<UserSession[]>(`/api/admin/users/${userId}/sessions`),
    enabled,
    staleTime: 0,
  });
  return (
    <Panel
      title="Login activity"
      description="Sign-ins and security events. Viewing this is recorded in the audit log."
      actions={
        !enabled ? (
          <Button size="sm" variant="outline" onClick={() => setEnabled(true)}>
            <Eye className="h-4 w-4" aria-hidden /> Show activity
          </Button>
        ) : null
      }
      bodyClassName={enabled ? "p-0" : undefined}
    >
      {!enabled ? (
        <p className="text-sm text-muted">Login activity contains IP addresses and devices. Open it only when needed for an investigation.</p>
      ) : isPending ? (
        <ListSkeleton rows={3} />
      ) : error ? (
        <ErrorState description={error.message} onRetry={() => void refetch()} />
      ) : data.length === 0 ? (
        <EmptyState title="No login activity recorded" />
      ) : (
        <DataTable caption="Login activity" head={["Event", "When", "IP address", "Device"]}>
          {data.map((s) => (
            <tr key={s.id}>
              <td className={`${td} font-semibold capitalize`}>{s.event.replace(/_/g, " ")}</td>
              <td className={td}>
                <TimeCell iso={s.created_at} />
              </td>
              <td className={`${td} font-mono text-xs`}>{s.ip ?? "—"}</td>
              <td className={`${td} max-w-xs truncate text-xs text-muted`} title={s.user_agent ?? undefined}>
                {s.device || s.user_agent || "—"}
              </td>
            </tr>
          ))}
        </DataTable>
      )}
    </Panel>
  );
}

function RoleManager({ userId, current, isSelf }: { userId: string; current: AdminRole | null; isSelf: boolean }) {
  const [role, setRole] = useState<string>(current ?? "");
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (next: AdminRole | null) => api.post(`/api/admin/users/${userId}/role`, { role: next }),
    onSuccess: () => {
      toast.success("Role updated");
      void queryClient.invalidateQueries({ queryKey: adminKeys.all });
    },
  });
  const next = (role || null) as AdminRole | null;
  return (
    <Panel title="Admin role" description="Only super admins can grant or revoke roles. Every change is audited.">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="flex flex-col gap-1 text-xs font-semibold text-ink-2">
          Role
          <Select value={role} onChange={(e) => setRole(e.target.value)} disabled={isSelf && current === "super_admin"}>
            <option value="">No admin role</option>
            <option value="moderator">Moderator</option>
            <option value="admin">Admin</option>
            <option value="super_admin">Super admin</option>
          </Select>
        </label>
        <Button
          loading={mutation.isPending}
          disabled={next === current || (isSelf && next === null)}
          onClick={async () => {
            const ok = await confirm({
              title: next ? `Make this user ${ROLE_LABEL[next]}?` : "Revoke admin access?",
              description: next
                ? "They will be able to access the admin dashboard with that role's permissions (after enrolling two-factor authentication)."
                : "They will immediately lose access to the admin dashboard.",
              confirmLabel: next ? "Grant role" : "Revoke",
              danger: !next || next === "super_admin",
            });
            if (ok) mutation.mutate(next);
          }}
        >
          Save role
        </Button>
      </div>
      {isSelf ? <p className="mt-2 text-xs text-muted">You can&apos;t revoke your own role.</p> : null}
    </Panel>
  );
}

export function UserDetailView() {
  const { id } = useParams<{ id: string }>();
  const admin = useAdmin();
  const [request, setRequest] = useState<ModerationRequest | null>(null);
  const { data, isPending, error, refetch } = useQuery({
    queryKey: adminKeys.user(id),
    queryFn: () => api.get<Detail>(`/api/admin/users/${id}`),
  });

  if (isPending) return <ListSkeleton rows={5} />;
  if (error) return <ErrorState description={error.message} onRetry={() => void refetch()} />;

  const u = data.user;
  const label = `${displayName(u)} (@${u.username})`;
  const isSelf = u.id === admin.userId;
  const protectedAdmin = Boolean(u.role) && admin.role !== "super_admin";
  const canModerate = !isSelf && !protectedAdmin;
  const open = (kind: ModerationRequest["kind"]) => setRequest({ kind, userId: u.id, userLabel: label });

  return (
    <div className="space-y-6">
      <Link href="/admin/users" className="inline-flex items-center gap-1 text-sm font-semibold text-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" aria-hidden /> All users
      </Link>

      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-soft)] md:flex-row md:items-center">
        <Avatar mediaId={u.avatar_media_id} name={displayName(u)} size="xl" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="truncate font-display text-2xl font-extrabold">{displayName(u)}</h1>
            <UserStatusBadge status={u.status} until={u.suspended_until} />
            <RoleBadge role={u.role} />
          </div>
          <p className="text-sm text-muted">
            @{u.username} ·{" "}
            <Link href={`/profile/${u.username}`} className="hover:text-brand hover:underline">
              public profile
            </Link>
          </p>
          {u.bio ? <p className="mt-2 whitespace-pre-wrap text-sm text-ink-2">{u.bio}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {canModerate ? (
            <>
              <Button variant="outline" size="sm" onClick={() => open("warn")}>
                <AlertTriangle className="h-4 w-4" aria-hidden /> Warn
              </Button>
              {u.status !== "suspended" && u.status !== "banned" ? (
                <Button variant="outline" size="sm" onClick={() => open("suspend")}>
                  <Timer className="h-4 w-4" aria-hidden /> Suspend
                </Button>
              ) : null}
              {hasRole(admin.role, "admin") && u.status !== "banned" ? (
                <Button variant="danger" size="sm" onClick={() => open("ban")}>
                  <Ban className="h-4 w-4" aria-hidden /> Ban
                </Button>
              ) : null}
              {u.status !== "active" ? (
                <Button size="sm" onClick={() => open("restore")}>
                  <RotateCcw className="h-4 w-4" aria-hidden /> Restore
                </Button>
              ) : null}
            </>
          ) : (
            <p className="max-w-xs text-xs text-muted">
              <ShieldCheck className="mr-1 inline h-4 w-4" aria-hidden />
              {isSelf ? "You can't moderate your own account." : "Only a super admin can moderate another admin."}
            </p>
          )}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-3">
        <Panel title="Account" className="lg:col-span-2">
          <KeyValue
            items={[
              { label: "User ID", value: <span className="font-mono text-xs">{u.id}</span> },
              { label: "Status", value: <UserStatusBadge status={u.status} until={u.suspended_until} /> },
              { label: "Created", value: fullDate(u.created_at) },
              { label: "Last seen", value: fullDate(u.last_seen_at) },
              { label: "Role", value: u.role ? ROLE_LABEL[u.role] : "None" },
              { label: "Reports against", value: u.report_count },
              { label: "Private account", value: u.is_private ? "Yes" : "No" },
              { label: "Verified / creator", value: `${u.is_verified ? "Verified" : "Not verified"} · ${u.is_creator ? "Creator" : "Standard"}` },
            ]}
          />
        </Panel>
        {admin.role === "super_admin" ? <RoleManager key={u.role ?? "none"} userId={u.id} current={u.role} isSelf={isSelf} /> : null}
      </div>

      <Panel title="Moderation history" description="Warnings, suspensions, bans and content actions affecting this user." bodyClassName="p-0">
        {data.actions.length === 0 ? (
          <EmptyState icon={<History />} title="No moderation history" />
        ) : (
          <DataTable caption="Moderation history" head={["Action", "Reason", "By", "When", "Expires", "Report"]}>
            {data.actions.map((a) => (
              <tr key={a.id}>
                <td className={`${td} font-semibold`}>
                  {ACTION_LABEL[a.action]}
                  {a.target_type !== "user" ? <span className="block text-xs font-normal text-muted">{a.target_type}</span> : null}
                </td>
                <td className={`${td} max-w-sm whitespace-pre-wrap break-words`}>{a.reason || "—"}</td>
                <td className={td}>{a.moderator ? `@${a.moderator.username}` : "—"}</td>
                <td className={td}>
                  <TimeCell iso={a.created_at} />
                </td>
                <td className={td}>{a.expires_at ? fullDate(a.expires_at) : "—"}</td>
                <td className={td}>
                  {a.report_id ? (
                    <Link href={`/admin/reports/${a.report_id}`} className="text-brand hover:underline">
                      View
                    </Link>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </Panel>

      <Panel title="Reports against this user" bodyClassName="p-0">
        {data.reports.length === 0 ? (
          <EmptyState title="No reports" />
        ) : (
          <DataTable caption="Reports against this user" head={["Report", "Type", "Status", "Reporter", "Filed"]}>
            {data.reports.map((r) => (
              <tr key={r.id}>
                <td className={td}>
                  <Link href={`/admin/reports/${r.id}`} className="font-semibold hover:text-brand hover:underline">
                    {reasonLabel(r.reason)}
                  </Link>
                </td>
                <td className={`${td} capitalize`}>{r.target_type}</td>
                <td className={td}>
                  <ReportStatusBadge status={r.status} />
                </td>
                <td className={td}>
                  <UserLink user={r.reporter} />
                </td>
                <td className={td}>
                  <TimeCell iso={r.created_at} />
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </Panel>

      {hasRole(admin.role, "admin") ? <LoginActivity userId={u.id} /> : null}

      <ModerationDialog request={request} onClose={() => setRequest(null)} />
    </div>
  );
}
