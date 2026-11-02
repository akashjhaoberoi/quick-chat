"use client";

import type { ReactNode } from "react";
import { AlertTriangle, Loader2, WifiOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export function Spinner({ className, label = "Loading" }: { className?: string; label?: string }) {
  return (
    <span role="status" aria-label={label} className={cn("inline-flex", className)}>
      <Loader2 className="h-5 w-5 animate-spin text-brand" aria-hidden />
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton rounded-xl", className)} aria-hidden />;
}

/** A list of avatar + two-line rows, the most common loading shape. */
export function ListSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-1 p-2" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 rounded-2xl p-3">
          <Skeleton className="h-12 w-12 shrink-0 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: ReactNode;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center px-6 py-14 text-center", className)}>
      {icon ? (
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-3xl bg-brand-soft text-brand [&>svg]:h-8 [&>svg]:w-8">
          {icon}
        </div>
      ) : null}
      <h3 className="font-display text-lg font-bold">{title}</h3>
      {description ? <p className="mt-1.5 max-w-sm text-sm text-muted">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  description,
  onRetry,
  offline,
  className,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
  offline?: boolean;
  className?: string;
}) {
  return (
    <div role="alert" className={cn("flex flex-col items-center justify-center px-6 py-12 text-center", className)}>
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-3xl bg-danger-soft text-danger">
        {offline ? <WifiOff className="h-7 w-7" /> : <AlertTriangle className="h-7 w-7" />}
      </div>
      <h3 className="font-display text-base font-bold">{title}</h3>
      {description ? <p className="mt-1 max-w-sm text-sm text-muted">{description}</p> : null}
      {onRetry ? (
        <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

/** Shown when an optional integration (calls, push, uploads) isn't configured on the server. */
export function SetupNotice({ feature, children }: { feature: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-surface-2 p-4 text-sm text-ink-2">
      <p className="font-semibold text-ink">{feature} isn&apos;t configured yet</p>
      <p className="mt-1 text-muted">
        {children ?? "An administrator needs to add the required credentials. See docs/SETUP.md for step-by-step instructions."}
      </p>
    </div>
  );
}
