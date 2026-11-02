import { NextResponse } from "next/server";
import { handler, unwrap } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { signedReadUrl, type StorageProvider } from "@/lib/storage";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { uuid } from "@/lib/validation";

/**
 * Authorizes access to a media object and redirects to a short-lived signed
 * URL. Snap media is only served while the viewer's window is open; the URL
 * expires with it and is never cached.
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

  let ttl = 600;
  if (media.purpose === "snap" && media.owner_id !== user.id) {
    const { data: rec } = await admin
      .from("snap_recipients")
      .select("view_expires_at, snaps!inner(media_id)")
      .eq("recipient_id", user.id)
      .eq("snaps.media_id", id)
      .maybeSingle();
    const remaining = rec?.view_expires_at ? (new Date(rec.view_expires_at).getTime() - Date.now()) / 1000 : 0;
    if (remaining <= 0) throw new ApiError(404, "media_not_found", "Media not found.");
    ttl = Math.min(remaining, 120);
  }

  const download = media.kind === "document" || req.nextUrl.searchParams.get("download") === "1";
  const url = await signedReadUrl(media.provider as StorageProvider, media.object_key, ttl, download ? media.file_name ?? "download" : undefined);
  const cacheable = media.purpose !== "snap" && ttl > 120;
  return NextResponse.redirect(url, {
    status: 302,
    headers: { "Cache-Control": cacheable ? `private, max-age=${Math.floor(ttl - 60)}` : "no-store" },
  });
});
