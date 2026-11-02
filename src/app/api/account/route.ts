import { z } from "zod";
import { handler, requireIntegration } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { getSupabaseAdmin, hasServiceRole } from "@/lib/supabase/admin";
import { deleteObjects, type StorageProvider } from "@/lib/storage";
import { log } from "@/lib/log";

const body = z.object({ confirmUsername: z.string().trim().toLowerCase().min(1).max(64) });

export const maxDuration = 60;

/**
 * DELETE /api/account {confirmUsername} — permanently deletes the account.
 *  1. Verifies the typed username matches the signed-in user.
 *  2. Deletes every stored media object the user uploaded (grouped by provider).
 *     Objects that can't be removed right now are queued for the cleanup job.
 *  3. Erases the content of messages they sent (rows stay, sender becomes null).
 *  4. Deletes the auth user; profile, Snaps, Stories, posts, settings, etc. cascade.
 * → { deleted: true, media: { deleted, queued } }
 */
export const DELETE = handler(
  { body, allowDuringMaintenance: true, rateLimit: { name: "account.delete", limit: 3, window: 3600 } },
  async ({ supabase, user, body }) => {
    requireIntegration(hasServiceRole(), "Account deletion (SUPABASE_SERVICE_ROLE_KEY)");

    const { data: profile } = await supabase.from("profiles").select("username").eq("id", user.id).maybeSingle();
    if (!profile) throw new ApiError(404, "user_not_found", "Profile not found.");
    if (profile.username !== body.confirmUsername.replace(/^@/, "")) {
      throw new ApiError(400, "confirmation_mismatch", "The username you typed doesn't match your account.");
    }

    const admin = getSupabaseAdmin();
    const media: { id: string; provider: StorageProvider; object_key: string }[] = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await admin
        .from("media_assets")
        .select("id, provider, object_key")
        .eq("owner_id", user.id)
        .neq("status", "deleted")
        .order("created_at", { ascending: true })
        .range(from, from + 999);
      if (error) throw new ApiError(500, "account_delete_failed", "Could not prepare account deletion. Please try again.");
      media.push(...((data ?? []) as typeof media));
      if (!data || data.length < 1000) break;
    }

    let deleted = 0;
    let queued = 0;
    for (const provider of ["r2", "supabase"] as StorageProvider[]) {
      const rows = media.filter((m) => m.provider === provider);
      if (rows.length === 0) continue;
      const ids = rows.map((r) => r.id);
      try {
        await deleteObjects(provider, rows.map((r) => r.object_key));
        for (let i = 0; i < ids.length; i += 500) {
          await admin.from("media_assets").update({ status: "deleted" }).in("id", ids.slice(i, i + 500));
        }
        deleted += rows.length;
      } catch (err) {
        // Leave it to /api/cron/cleanup, which retries pending deletions.
        log("warn", "account_media_delete_failed", { provider, count: rows.length, error: (err as Error).message });
        for (let i = 0; i < ids.length; i += 500) {
          await admin
            .from("media_assets")
            .update({ status: "pending_delete", delete_after: new Date().toISOString() })
            .in("id", ids.slice(i, i + 500));
        }
        queued += rows.length;
      }
    }

    // Messages keep their row (sender becomes null) so conversations stay coherent for
    // the other participants, but their content is erased like "delete for everyone".
    const { error: msgError } = await admin
      .from("messages")
      .update({ body: null, metadata: {}, deleted_at: new Date().toISOString() })
      .eq("sender_id", user.id)
      .is("deleted_at", null);
    if (msgError) log("warn", "account_message_wipe_failed", { error: msgError.message });

    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) {
      log("error", "account_delete_failed", { error: error.message });
      throw new ApiError(500, "account_delete_failed", "Your account could not be deleted. Please try again or contact support.");
    }
    // Clear this browser's (now useless) auth cookies.
    await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
    log("info", "account_deleted", { media: media.length, deleted, queued });
    return { deleted: true, media: { deleted, queued } };
  },
);
