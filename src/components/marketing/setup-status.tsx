"use client";

import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, CircleDashed, RefreshCw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ErrorState, Skeleton } from "@/components/ui/feedback";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/utils";

type Health = {
  status: "ok" | "degraded";
  database: "ok" | "unreachable" | "not_configured";
  latencyMs: number | null;
  integrations: {
    supabase: boolean;
    serviceRole: boolean;
    storage: "r2" | "supabase" | null;
    livekit: boolean;
    push: boolean;
    email: boolean;
    redis: boolean;
    cron: boolean;
  };
  time: string;
};

function Row({ ok, label, detail, required }: { ok: boolean; label: string; detail: string; required?: boolean }) {
  const Icon = ok ? CheckCircle2 : required ? XCircle : CircleDashed;
  return (
    <li className="flex items-start gap-3 py-3">
      <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", ok ? "text-success" : required ? "text-danger" : "text-muted")} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">
          {label} {required ? <span className="text-xs font-bold text-danger">required</span> : <span className="text-xs font-semibold text-muted">optional</span>}
        </p>
        <p className="text-xs text-muted">{detail}</p>
      </div>
      <span className={cn("text-xs font-bold", ok ? "text-success" : required ? "text-danger" : "text-muted")}>{ok ? "Configured" : "Missing"}</span>
    </li>
  );
}

/** Live integration status from GET /api/health (booleans only, never secrets). */
export function SetupStatus() {
  const health = useQuery({ queryKey: ["health"], queryFn: () => api.get<Health>("/api/health"), refetchInterval: 15_000, meta: { silent: true } });

  if (health.isPending) {
    return (
      <div className="space-y-3" aria-busy="true">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }
  if (health.isError) return <ErrorState title="Couldn't reach /api/health" description="Is the dev server running?" onRetry={() => void health.refetch()} />;

  const i = health.data.integrations;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-sm text-muted">
          Database:{" "}
          <strong className={health.data.database === "ok" ? "text-success" : "text-danger"}>
            {health.data.database === "ok" ? `reachable (${health.data.latencyMs} ms)` : health.data.database.replace("_", " ")}
          </strong>
        </p>
        <Button variant="ghost" size="sm" onClick={() => void health.refetch()} loading={health.isFetching}>
          {!health.isFetching ? <RefreshCw className="h-3.5 w-3.5" /> : null} Recheck
        </Button>
      </div>
      <ul className="divide-y divide-border">
        <Row required ok={i.supabase} label="Supabase" detail="NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY" />
        <Row required ok={i.serviceRole} label="Supabase service role" detail="SUPABASE_SERVICE_ROLE_KEY — media, push, admin, account deletion (server-only)" />
        <Row ok={Boolean(i.storage)} label={`Media storage${i.storage ? ` (${i.storage === "r2" ? "Cloudflare R2" : "Supabase Storage"})` : ""}`} detail="CLOUDFLARE_R2_* or Supabase Storage bucket (SUPABASE_STORAGE_BUCKET)" />
        <Row ok={i.livekit} label="LiveKit calls" detail="LIVEKIT_URL, LIVEKIT_API_KEY, LIVEKIT_API_SECRET" />
        <Row ok={i.push} label="Push notifications (Firebase)" detail="NEXT_PUBLIC_FIREBASE_* and FIREBASE_SERVICE_ACCOUNT" />
        <Row ok={i.email} label="Security emails (Resend)" detail="RESEND_API_KEY, RESEND_FROM_EMAIL" />
        <Row ok={i.redis} label="Shared rate limiting (Redis)" detail="REDIS_URL — falls back to per-instance memory" />
        <Row ok={i.cron} label="Background jobs" detail="CRON_SECRET — required in production for media cleanup" />
      </ul>
    </div>
  );
}
