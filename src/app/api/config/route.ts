import { connection } from "next/server";
import { handler } from "@/lib/api/handler";
import { integrationStatus, isSupabaseConfigured } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Public client configuration: which optional features are available, maintenance state, announcements. */
export const GET = handler({ auth: "none" }, async () => {
  await connection();
  const s = integrationStatus();
  let maintenance = { enabled: false, message: "" };
  let announcements: { id: string; title: string; body: string; level: string }[] = [];
  if (isSupabaseConfigured) {
    const supabase = await createSupabaseServerClient();
    const [{ data: settings }, { data: ann }] = await Promise.all([
      supabase.from("app_settings").select("key, value").in("key", ["maintenance_mode", "registration_open"]),
      supabase.from("announcements").select("id, title, body, level").order("created_at", { ascending: false }).limit(3),
    ]);
    const m = settings?.find((r) => r.key === "maintenance_mode")?.value as { enabled?: boolean; message?: string } | undefined;
    maintenance = { enabled: Boolean(m?.enabled), message: m?.message ?? "" };
    announcements = ann ?? [];
    const reg = settings?.find((r) => r.key === "registration_open")?.value;
    return {
      features: { calls: s.livekit, push: s.push, uploads: Boolean(s.storage), email: s.email },
      registrationOpen: reg !== false,
      maintenance,
      announcements,
    };
  }
  return {
    features: { calls: false, push: false, uploads: false, email: false },
    registrationOpen: false,
    maintenance,
    announcements,
  };
});
