import { connection } from "next/server";
import { handler } from "@/lib/api/handler";
import { integrationStatus, isSupabaseConfigured, publicEnv } from "@/lib/env";

/** Liveness + integration status (booleans only — never exposes secrets). */
export const GET = handler({ auth: "none" }, async () => {
  await connection();
  const integrations = integrationStatus();
  let database: "ok" | "unreachable" | "not_configured" = "not_configured";
  let latencyMs: number | null = null;
  if (isSupabaseConfigured) {
    const started = Date.now();
    try {
      const res = await fetch(`${publicEnv.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/app_settings?select=key&limit=1`, {
        headers: { apikey: publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY!, Authorization: `Bearer ${publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY}` },
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });
      database = res.ok ? "ok" : "unreachable";
    } catch {
      database = "unreachable";
    }
    latencyMs = Date.now() - started;
  }
  return { status: database === "ok" ? "ok" : "degraded", database, latencyMs, integrations, time: new Date().toISOString() };
});
