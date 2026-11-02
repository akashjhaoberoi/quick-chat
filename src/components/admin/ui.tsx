"use client";

import { useState, type ReactNode, type SelectHTMLAttributes } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, ImageOff } from "lucide-react";
import { format } from "date-fns";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/controls";
import { Skeleton } from "@/components/ui/feedback";
import { cn, displayName, mediaUrl, relativeTime } from "@/lib/utils";
import type { AdminRole, MiniProfile, ReportStatus } from "./types";
import { ROLE_LABEL } from "./types";

/** Page heading used by every admin section. */
export function AdminPageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-extrabold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 max-w-3xl text-sm text-muted">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function Panel({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("rounded-2xl border border-border bg-surface shadow-[var(--shadow-soft)]", className)}>
      {title || actions ? (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
          <div className="min-w-0">
            {title ? <h2 className="font-display text-base font-bold">{title}</h2> : null}
            {description ? <p className="mt-0.5 text-xs text-muted">{description}</p> : null}
          </div>
          {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
        </header>
      ) : null}
      <div className={cn("p-4 sm:p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

export function StatCard({
  label,
  value,
  hint,
  href,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  href?: string;
  tone?: "warning" | "danger";
}) {
  const body = (
    <>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p
        className={cn(
          "mt-1.5 font-display text-2xl font-extrabold tabular-nums",
          tone === "warning" && "text-warning",
          tone === "danger" && "text-danger",
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </>
  );
  const cls = "block rounded-2xl border border-border bg-surface p-4 shadow-[var(--shadow-soft)]";
  return href ? (
    <Link href={href} className={cn(cls, "transition-colors hover:border-brand focus-visible:border-brand")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-7 w-16" />
    </div>
  );
}

/** Native select with design-system styling (accessible by default). */
export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-10 rounded-xl border border-border bg-surface px-3 text-sm text-ink focus:border-brand focus:outline-none focus:ring-4 focus:ring-[var(--ring)]",
        className,
      )}
      {...props}
    >
      {children}
    </select>
  );
}

export function FilterLabel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-semibold text-ink-2">
      {label}
      {children}
    </label>
  );
}

/** Accessible table wrapper; scrolls horizontally on small screens. */
export function DataTable({ caption, head, children }: { caption: string; head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto scrollbar-thin">
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-border text-xs uppercase tracking-wide text-muted">
            {head.map((h, i) => (
              <th key={i} scope="col" className="whitespace-nowrap px-3 py-2.5 font-semibold first:pl-4 last:pr-4">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">{children}</tbody>
      </table>
    </div>
  );
}

export const td = "px-3 py-3 align-middle first:pl-4 last:pr-4";

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-3 p-4" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4">
          {Array.from({ length: cols }).map((__, j) => (
            <Skeleton key={j} className={cn("h-5", j === 0 ? "w-1/4" : "flex-1")} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function Pagination({
  offset,
  limit,
  count,
  total,
  hasMore,
  onChange,
  disabled,
}: {
  offset: number;
  limit: number;
  count: number;
  total: number | null;
  hasMore: boolean;
  onChange: (offset: number) => void;
  disabled?: boolean;
}) {
  if (offset === 0 && !hasMore) {
    return total !== null && total > 0 ? <p className="px-4 py-3 text-xs text-muted">{total} total</p> : null;
  }
  return (
    <nav className="flex items-center justify-between gap-3 border-t border-border px-4 py-3" aria-label="Pagination">
      <p className="text-xs text-muted" aria-live="polite">
        {count === 0 ? "No results" : `Showing ${offset + 1}–${offset + count}`}
        {total !== null ? ` of ${total}` : ""}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onChange(Math.max(0, offset - limit))}
          disabled={disabled || offset === 0}
          className="inline-flex h-8 items-center gap-1 rounded-xl border border-border px-3 text-sm font-semibold hover:bg-surface-2 disabled:opacity-40"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden /> Previous
        </button>
        <button
          type="button"
          onClick={() => onChange(offset + limit)}
          disabled={disabled || !hasMore}
          className="inline-flex h-8 items-center gap-1 rounded-xl border border-border px-3 text-sm font-semibold hover:bg-surface-2 disabled:opacity-40"
        >
          Next <ChevronRight className="h-4 w-4" aria-hidden />
        </button>
      </div>
    </nav>
  );
}

export function UserStatusBadge({ status, until }: { status: string; until?: string | null }) {
  const tone = status === "active" ? "success" : status === "suspended" ? "warning" : status === "banned" ? "danger" : "muted";
  return (
    <Badge tone={tone} className="capitalize">
      {status}
      {status === "suspended" && until ? ` · until ${format(new Date(until), "d MMM yyyy")}` : ""}
    </Badge>
  );
}

export function ReportStatusBadge({ status }: { status: ReportStatus }) {
  const tone = status === "pending" ? "warning" : status === "reviewing" ? "brand" : status === "actioned" ? "success" : "muted";
  return (
    <Badge tone={tone} className="capitalize">
      {status}
    </Badge>
  );
}

export function RoleBadge({ role }: { role: AdminRole | null | undefined }) {
  if (!role) return null;
  return <Badge tone={role === "super_admin" ? "accent" : role === "admin" ? "brand" : "muted"}>{ROLE_LABEL[role]}</Badge>;
}

/** Avatar + name linking to the admin user page (with optional public profile link). */
export function UserLink({ user, sub, showPublic }: { user: MiniProfile | null | undefined; sub?: ReactNode; showPublic?: boolean }) {
  if (!user) return <span className="text-sm text-muted">Deleted account</span>;
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <Avatar mediaId={user.avatar_media_id} name={displayName(user)} size="sm" />
      <span className="min-w-0">
        <Link href={`/admin/users/${user.id}`} className="block truncate text-sm font-semibold hover:text-brand hover:underline">
          {displayName(user)}
        </Link>
        <span className="block truncate text-xs text-muted">
          @{user.username}
          {showPublic ? (
            <>
              {" · "}
              <Link href={`/profile/${user.username}`} className="hover:text-brand hover:underline">
                public profile
              </Link>
            </>
          ) : null}
          {sub ? <> · {sub}</> : null}
        </span>
      </span>
    </span>
  );
}

export function TimeCell({ iso }: { iso: string | null | undefined }) {
  if (!iso) return <span className="text-muted">—</span>;
  return (
    <time dateTime={iso} title={format(new Date(iso), "PPpp")} className="whitespace-nowrap">
      {relativeTime(iso)}
    </time>
  );
}

export function fullDate(iso: string | null | undefined): string {
  return iso ? format(new Date(iso), "d MMM yyyy, HH:mm") : "—";
}

/** Pretty-printed JSON (rendered as text, never HTML). */
export function JsonView({ value, label = "Details" }: { value: unknown; label?: string }) {
  const empty = value === null || value === undefined || (typeof value === "object" && Object.keys(value as object).length === 0);
  if (empty) return <span className="text-xs text-muted">—</span>;
  return (
    <details className="group">
      <summary className="cursor-pointer select-none text-xs font-semibold text-brand hover:underline">{label}</summary>
      <pre className="mt-2 max-h-72 max-w-xl overflow-auto whitespace-pre-wrap break-all rounded-xl bg-surface-2 p-3 font-mono text-[11px] leading-relaxed text-ink-2 scrollbar-thin">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}

/** Media preview through /api/media (authorized server-side; moderators may view reported media). */
export function MediaPreview({
  mediaId,
  kind,
  className,
  alt = "",
}: {
  mediaId: string | null | undefined;
  kind?: string | null;
  className?: string;
  alt?: string;
}) {
  const [failed, setFailed] = useState(false);
  const src = mediaUrl(mediaId);
  if (!src || failed) {
    return (
      <div
        className={cn("flex flex-col items-center justify-center gap-1 rounded-xl bg-surface-2 p-3 text-center text-xs text-muted", className)}
        role="img"
        aria-label="Media preview unavailable"
      >
        <ImageOff className="h-5 w-5" aria-hidden />
        <span>{src ? "Preview unavailable" : "No media"}</span>
      </div>
    );
  }
  if (kind === "video") {
    return (
      <video
        src={src}
        controls
        preload="metadata"
        playsInline
        onError={() => setFailed(true)}
        className={cn("rounded-xl bg-black object-contain", className)}
      />
    );
  }
  return (
    // Signed, short-lived URLs from /api/media are not suitable for next/image optimisation.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} className={cn("rounded-xl bg-surface-2 object-cover", className)} />
  );
}

export function KeyValue({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{i.label}</dt>
          <dd className="mt-0.5 break-words text-sm">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}
