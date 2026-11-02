import { handler } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { deleteObjects, objectInfo, readObjectHead, type StorageProvider } from "@/lib/storage";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { sniffMatches } from "@/lib/media-rules";
import { uuid } from "@/lib/validation";

/** Verifies an uploaded object (size + file signature) before it can be used. */
export const POST = handler({ rateLimit: { name: "media.complete", limit: 60, window: 60 } }, async ({ user, params }) => {
  const id = uuid.parse(params.id);
  const admin = getSupabaseAdmin();
  const { data: media } = await admin
    .from("media_assets")
    .select("id, owner_id, provider, object_key, mime_type, size_bytes, status")
    .eq("id", id)
    .maybeSingle();
  if (!media || media.owner_id !== user.id) throw new ApiError(404, "media_not_found", "Upload not found.");
  if (media.status === "ready") return { id, status: "ready" };
  if (media.status !== "pending") throw new ApiError(409, "media_not_pending", "This upload can no longer be completed.");

  const provider = media.provider as StorageProvider;
  const info = await objectInfo(provider, media.object_key);
  if (!info) throw new ApiError(409, "upload_missing", "The file hasn't finished uploading.");

  const head = await readObjectHead(provider, media.object_key);
  const valid = info.size === Number(media.size_bytes) && head !== null && sniffMatches(media.mime_type, head);
  if (!valid) {
    await deleteObjects(provider, [media.object_key]).catch(() => undefined);
    await admin.from("media_assets").update({ status: "deleted" }).eq("id", id);
    throw new ApiError(422, "invalid_file_contents", "The file contents don't match its type.");
  }

  await admin.from("media_assets").update({ status: "ready", ready_at: new Date().toISOString() }).eq("id", id);
  return { id, status: "ready" };
});
