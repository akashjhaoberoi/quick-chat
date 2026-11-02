import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { getSupabaseAdmin, hasServiceRole } from "@/lib/supabase/admin";
import { recordError } from "@/lib/log";

/** Columns embedded for any profile reference in admin responses. */
export const PROFILE = "id, username, display_name, avatar_media_id, status";

export const PAGE_SIZE = 25;

export const offsetParam = z.coerce.number().int().min(0).max(1_000_000).default(0);
export const reasonSchema = z.string().trim().min(3, "Please give a reason (at least 3 characters)").max(500);

export function page<T>(items: T[], offset: number, limit: number, total: number | null) {
  const hasMore = total !== null ? offset + items.length < total : items.length > limit;
  return { items: items.slice(0, limit), offset, limit, total, hasMore };
}

/** Postgres ilike pattern with wildcards in the user's text escaped. */
export function likePattern(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export type AuthSync = "applied" | "skipped" | "failed";

/**
 * Mirrors a profile status change at the Supabase Auth layer so a suspended or
 * banned user can no longer sign in or refresh their session. Runs only after
 * the role-checked RPC has succeeded; the result is written to the audit log
 * via admin_log_access (as the acting admin).
 */
export async function syncAuthBan(
  supabase: SupabaseClient,
  userId: string,
  status: "active" | "suspended" | "banned",
  days?: number | null,
  actorId?: string,
): Promise<AuthSync> {
  if (!hasServiceRole()) return "skipped";
  const banDuration = status === "banned" ? "876000h" : status === "suspended" ? `${Math.max(1, days ?? 1) * 24}h` : "none";
  let result: AuthSync = "applied";
  try {
    const { error } = await getSupabaseAdmin().auth.admin.updateUserById(userId, { ban_duration: banDuration });
    if (error) throw error;
  } catch (error) {
    result = "failed";
    await recordError("admin.auth_ban_sync", error, { userId, status }, actorId);
  }
  const action =
    result === "failed" ? "auth.sync_failed" : status === "active" ? "auth.sign_in_restored" : `auth.sign_in_blocked_${banDuration}`;
  await supabase.rpc("admin_log_access", { p_action: action, p_target_type: "user", p_target_id: userId });
  return result;
}
