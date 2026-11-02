import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { publicEnv, serverEnv } from "@/lib/env";

let adminClient: SupabaseClient | null = null;

/**
 * Service-role client. Bypasses RLS — use only for operations that have
 * already been authorized in server code (media rows, push dispatch, admin
 * auth actions, cron jobs).
 */
export function getSupabaseAdmin(): SupabaseClient {
  const key = serverEnv().SUPABASE_SERVICE_ROLE_KEY;
  if (!publicEnv.NEXT_PUBLIC_SUPABASE_URL || !key) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  }
  if (!adminClient) {
    adminClient = createClient(publicEnv.NEXT_PUBLIC_SUPABASE_URL, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return adminClient;
}

export function hasServiceRole(): boolean {
  return Boolean(publicEnv.NEXT_PUBLIC_SUPABASE_URL && serverEnv().SUPABASE_SERVICE_ROLE_KEY);
}
