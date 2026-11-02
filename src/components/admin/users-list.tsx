"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Search, Users } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { EmptyState, ErrorState } from "@/components/ui/feedback";
import { api } from "@/lib/api/client";
import { displayName } from "@/lib/utils";
import { adminKeys } from "./keys";
import { AdminPageHeader, DataTable, FilterLabel, Pagination, Panel, RoleBadge, Select, TableSkeleton, td, TimeCell, UserStatusBadge } from "./ui";
import type { AdminUserRow, Page } from "./types";

export function UsersList() {
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setQ(text.trim());
      setOffset(0);
    }, 300);
    return () => window.clearTimeout(t);
  }, [text]);

  const { data, isPending, isFetching, error, refetch } = useQuery({
    queryKey: adminKeys.users(q, status, offset),
    queryFn: () => api.get<Page<AdminUserRow>>("/api/admin/users", { q, status, offset }),
    placeholderData: keepPreviousData,
  });

  return (
    <div>
      <AdminPageHeader title="Users" description="Search accounts by username, display name or user ID. Open a user to moderate them." />
      <Panel bodyClassName="p-0">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-end">
          <FilterLabel label="Search">
            <span className="relative block sm:w-80">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
              <Input
                type="search"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Username, name or ID"
                className="h-10 pl-9"
              />
            </span>
          </FilterLabel>
          <FilterLabel label="Status">
            <Select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setOffset(0);
              }}
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
              <option value="banned">Banned</option>
              <option value="deactivated">Deactivated</option>
            </Select>
          </FilterLabel>
        </div>
        {isPending ? (
          <TableSkeleton />
        ) : error ? (
          <ErrorState description={error.message} onRetry={() => void refetch()} />
        ) : data.items.length === 0 ? (
          <EmptyState icon={<Users />} title="No users found" description="Try a different search or status filter." />
        ) : (
          <div aria-busy={isFetching}>
            <DataTable caption="Users" head={["User", "Status", "Role", "Reports", "Joined", "Last seen"]}>
              {data.items.map((u) => (
                <tr key={u.id} className="hover:bg-surface-2/60">
                  <td className={td}>
                    <span className="flex items-center gap-2.5">
                      <Avatar mediaId={u.avatar_media_id} name={displayName(u)} size="sm" />
                      <span className="min-w-0">
                        <Link href={`/admin/users/${u.id}`} className="block truncate font-semibold hover:text-brand hover:underline">
                          {displayName(u)}
                        </Link>
                        <span className="block truncate text-xs text-muted">@{u.username}</span>
                      </span>
                    </span>
                  </td>
                  <td className={td}>
                    <UserStatusBadge status={u.status} until={u.suspended_until} />
                  </td>
                  <td className={td}>{u.role ? <RoleBadge role={u.role} /> : <span className="text-muted">—</span>}</td>
                  <td className={`${td} tabular-nums`}>{u.report_count ? <span className="font-semibold text-warning">{u.report_count}</span> : 0}</td>
                  <td className={td}>
                    <TimeCell iso={u.created_at} />
                  </td>
                  <td className={td}>
                    <TimeCell iso={u.last_seen_at} />
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
