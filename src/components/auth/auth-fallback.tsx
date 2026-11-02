import { Skeleton } from "@/components/ui/feedback";

/** Static placeholder while auth forms (which read search params) hydrate. */
export function AuthFallback() {
  return (
    <div className="rounded-3xl border border-border bg-surface p-6 shadow-[var(--shadow-soft)] sm:p-8" aria-busy="true" aria-label="Loading">
      <Skeleton className="mb-3 h-8 w-2/3" />
      <Skeleton className="mb-8 h-4 w-1/2" />
      <div className="space-y-4">
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-12 w-full rounded-2xl" />
      </div>
    </div>
  );
}
