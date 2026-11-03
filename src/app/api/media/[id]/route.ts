import { after, NextResponse } from "next/server";
import { handler, unwrap } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { log } from "@/lib/log";
import { signedReadUrl, type StorageProvider } from "@/lib/storage";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { uuid } from "@/lib/validation";

/** Lifetime of a signed URL for ordinary media (profile photos, chat media, stories). */
const DEFAULT_TTL = 300;
/** Protected, view-once and snap media: the URL dies quickly and is never cached. */
const PROTECTED_TTL = 60;

/**
 * Authorizes access to a media object and redirects to a short-lived signed
 * URL. Storage is private; this route is the only way to read an object.
 *  - Profile/cover photos follow the owner's visibility setting (database).
 *  - Snap and view-once media are only served inside the viewer's window.
 *  - Protected and view-once chat media can't be downloaded, and every access
 *    is logged.
 */
export const GET = handler({ rateLimit: { name: "media.read", limit: 600, window: 60 } }, async ({ user, supabase, params, req }) => {
  const id = uuid.parse(params.id);
  const allowed = unwrap(await supabase.rpc("can_access_media", { p_media_id: id })) as boolean;
  if (!allowed) throw new ApiError(404, "media_not_found", "Media not found.");

  const admin = getSupabaseAdmin();
  const { data: media } = await admin
    .from("media_assets")
    .select("provider, object_key, purpose, kind, file_name, owner_id")
    .eq("id", id)
    .single();
  if (!media) throw new ApiError(404, "media_not_found", "Media not found.");

  const isOwner = media.owner_id === user.id;
  let ttl = DEFAULT_TTL;
  let mode: "snap" | "view_once" | "protected" | null = null;

  if (media.purpose === "snap" && !isOwner) {
    const { data: rec } = await admin
      .from("snap_recipients")
      .select("view_expires_at, snaps!inner(media_id)")
      .eq("recipient_id", user.id)
      .eq("snaps.media_id", id)
      .maybeSingle();
    const remaining = rec?.view_expires_at ? (new Date(rec.view_expires_at).getTime() - Date.now()) / 1000 : 0;
    if (remaining <= 0) throw new ApiError(404, "media_not_found", "Media not found.");
    ttl = Math.min(remaining, PROTECTED_TTL);
    mode = "snap";
  }

  if (media.purpose === "message" && !isOwner) {
    const { data: links } = await admin
      .from("message_attachments")
      .select("message_id, messages!inner(media_mode)")
      .eq("media_id", id)
      .limit(20);
    const rows = (links ?? []) as unknown as { message_id: string; messages: { media_mode: string } }[];
    const modes = rows.map((l) => l.messages.media_mode);
    if (modes.includes("view_once")) {
      const { data: view } = await admin
        .from("message_media_views")
        .select("view_expires_at")
        .eq("viewer_id", user.id)
        .in("message_id", rows.map((r) => r.message_id))
        .order("view_expires_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const remaining = view ? (new Date(view.view_expires_at).getTime() - Date.now()) / 1000 : 0;
      if (remaining <= 0) throw new ApiError(404, "media_not_found", "Media not found.");
      ttl = Math.min(remaining, PROTECTED_TTL);
      mode = "view_once";
    } else if (modes.includes("protected")) {
      ttl = PROTECTED_TTL;
      mode = "protected";
    }
  }

  const wantsDownload = req.nextUrl.searchParams.get("download") === "1";
  if (mode && mode !== "snap" && wantsDownload) {
    throw new ApiError(403, "download_not_allowed", "The sender turned off downloading for this media.");
  }
  const download = !mode && (media.kind === "document" || wantsDownload);
  const url = await signedReadUrl(media.provider as StorageProvider, media.object_key, ttl, download ? media.file_name ?? "download" : undefined);

  if (mode) {
    const accessMode = mode;
    after(async () => {
      const { error } = await admin.from("media_access_log").insert({ media_id: id, viewer_id: user.id, purpose: media.purpose, mode: accessMode });
      if (error) log("warn", "media_access_log_failed", { error: error.message });
    });
  }

  return NextResponse.redirect(url, {
    status: 302,
    headers: {
      "Cache-Control": mode ? "no-store" : `private, max-age=${Math.floor(ttl - 60)}`,
      "Referrer-Policy": "no-referrer",
    },
  });
});
