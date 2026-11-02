"use client";

import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, CircleSlash, XCircle } from "lucide-react";
import { ErrorState, Skeleton } from "@/components/ui/feedback";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { adminKeys } from "./keys";
import { Panel } from "./ui";
import type { Health } from "./types";

const INTEGRATIONS: { key: keyof Health["integrations"]; label: string; purpose: string }[] = [
  { key: "supabase", label: "Supabase", purpose: "Database, auth, realtime" },
  { key: "serviceRole", label: "Service role key", purpose: "Media, push, auth bans, maintenance" },
  { key: "storage", label: "Media storage", purpose: "Uploads (Cloudflare R2 or Supabase Storage)" },
  { key: "livekit", label: "LiveKit", purpose: "Audio / video calls" },
  { key: "push", label: "Firebase Cloud Messaging", purpose: "Browser push notifications" },
  { key: "email", label: "Resend", purpose: "Security alert emails" },
  { key: "redis", label: "Redis", purpose: "Shared rate limiting" },
  { key: "cron", label: "Cron secret", purpose: "Vercel cron endpoints" },
];

export function useHealth() {
  return useQuery({
    queryKey: adminKeys.health,
    queryFn: () => api.get<Health>("/api/health", undefined, { cache: "no-store" }),
    refetchInterval: 60_000,
  });
}

function StatusIcon({ ok, optional }: { ok: boolean; optional?: boolean }) {
  if (ok) return <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden />;
  return optional ? <CircleSlash className="h-4 w-4 shrink-0 text-muted" aria-hidden /> : <XCircle className="h-4 w-4 shrink-0 text-danger" aria-hidden />;
}

/** Database status/latency and integration configuration from GET /api/health. */
export function HealthSummary({ compact }: { compact?: boolean }) {
  const { data, isPending, error, refetch } = useHealth();
  return (
    <Panel title="System health" description={data ? `Checked ${new Date(data.time).toLocaleTimeString()}` : undefined}>
      {isPending ? (
        <div className="space-y-2">
          <Skeleton className="h-6 w-1/2" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </div>
      ) : error ? (
        <ErrorState title="Health check failed" description={error.message} onRetry={() => void refetch()} />
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-bold",
                data.database === "ok" ? "bg-success/15 text-success" : "bg-danger-soft text-danger",
              )}
            >
              <StatusIcon ok={data.database === "ok"} />
              Database {data.database === "ok" ? "healthy" : data.database === "unreachable" ? "unreachable" : "not configured"}
            </span>
            {data.latencyMs !== null ? <span className="text-sm text-muted tabular-nums">{data.latencyMs} ms round-trip</span> : null}
          </div>
          <ul className={cn("grid gap-2", compact ? "sm:grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-4")}>
            {INTEGRATIONS.map((i) => {
              const v = data.integrations[i.key];
              const ok = Boolean(v);
              const required = i.key === "supabase" || i.key === "serviceRole";
              return (
                <li key={i.key} className="flex items-start gap-2 rounded-xl bg-surface-2 px-3 py-2">
                  <span className="mt-0.5">
                    <StatusIcon ok={ok} optional={!required} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">
                      {i.label}
                      {i.key === "storage" && v ? ` (${v === "r2" ? "R2" : "Supabase"})` : ""}
                      <span className="sr-only">: {ok ? "configured" : "not configured"}</span>
                    </span>
                    {!compact ? <span className="block text-xs text-muted">{i.purpose}</span> : null}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Panel>
  );
}
