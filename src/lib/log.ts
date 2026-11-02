import "server-only";

type Level = "debug" | "info" | "warn" | "error";

/** Structured JSON logs (picked up by Vercel log drains). Never log secrets or message bodies. */
export function log(level: Level, msg: string, fields: Record<string, unknown> = {}) {
  const line = JSON.stringify({ level, msg, time: new Date().toISOString(), ...fields });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/** Records an unexpected server error for the admin "Errors" view (best effort). */
export async function recordError(source: string, error: unknown, context: Record<string, unknown> = {}, userId?: string) {
  const message = error instanceof Error ? error.message : String(error);
  log("error", "server_error", { source, message, ...context });
  try {
    const { getSupabaseAdmin, hasServiceRole } = await import("@/lib/supabase/admin");
    if (!hasServiceRole()) return;
    await getSupabaseAdmin()
      .from("app_errors")
      .insert({ source, message: message.slice(0, 2000), context, user_id: userId ?? null });
  } catch {
    // Never let error reporting throw.
  }
}
