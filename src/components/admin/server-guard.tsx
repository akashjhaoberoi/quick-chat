import "server-only";
import type { ReactNode } from "react";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { isSupabaseConfigured, serverEnv } from "@/lib/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { MfaRequired } from "./admin-gate";

/**
 * Server-side admin check for /admin (must render inside <Suspense> because it
 * reads the request cookies). Mirrors handler({ auth: { admin } }): a row in
 * admin_roles (read under RLS as the user) and, when ADMIN_REQUIRE_MFA=true,
 * an aal2 session. The API re-checks on every request; this only keeps
 * non-admins from ever receiving the dashboard shell.
 */
export async function AdminServerGuard({ children }: { children: ReactNode }) {
  // Opt into request-time rendering before anything can throw during prerender.
  await connection();
  if (!isSupabaseConfigured) redirect("/setup");
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims as { sub?: string; aal?: string } | undefined;
  if (!claims?.sub) redirect("/login?next=/admin");

  const { data: role } = await supabase.from("admin_roles").select("role").eq("user_id", claims.sub).maybeSingle();
  if (!role) redirect("/home");

  if (serverEnv().ADMIN_REQUIRE_MFA && claims.aal !== "aal2") return <MfaRequired />;
  return <>{children}</>;
}
