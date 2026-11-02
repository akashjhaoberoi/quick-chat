import { z } from "zod";
import { handler, requireIntegration } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import { activeProvider, createUploadTarget } from "@/lib/storage";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { baseMime, DAILY_UPLOAD_BYTES, extensionFor, validateUpload } from "@/lib/media-rules";

const body = z.object({
  purpose: z.enum(["avatar", "cover", "message", "snap", "story", "post", "group_avatar"]),
  mime: z.string().min(3).max(120),
  size: z.number().int().positive(),
  fileName: z.string().max(200).optional(),
  width: z.number().int().positive().max(20_000).optional(),
  height: z.number().int().positive().max(20_000).optional(),
  durationMs: z.number().int().nonnegative().max(4 * 60 * 60 * 1000).optional(),
});

export const POST = handler(
  { body, rateLimit: { name: "media.upload", limit: 60, window: 60 } },
  async ({ user, body }) => {
    const provider = activeProvider();
    requireIntegration(Boolean(provider), "Media storage");
    const mime = baseMime(body.mime);
    const check = validateUpload(mime, body.size, body.purpose);
    if (!check.ok) throw new ApiError(400, "invalid_file", check.reason);

    const admin = getSupabaseAdmin();
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: usage } = await admin
      .from("media_assets")
      .select("size_bytes")
      .eq("owner_id", user.id)
      .gte("created_at", since)
      .limit(5000);
    const used = (usage ?? []).reduce((sum, r) => sum + Number(r.size_bytes), 0);
    if (used + body.size > DAILY_UPLOAD_BYTES) {
      throw new ApiError(429, "upload_quota_exceeded", "You've reached today's upload limit. Try again tomorrow.");
    }

    const now = new Date();
    const key = `${user.id}/${body.purpose}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${crypto.randomUUID()}.${extensionFor(mime)}`;
    const { data: row, error } = await admin
      .from("media_assets")
      .insert({
        owner_id: user.id,
        provider: provider!,
        object_key: key,
        kind: check.kind,
        mime_type: mime,
        size_bytes: body.size,
        width: body.width ?? null,
        height: body.height ?? null,
        duration_ms: body.durationMs ?? null,
        file_name: body.fileName?.replace(/[^\w.\- ()]/g, "_") ?? null,
        purpose: body.purpose,
      })
      .select("id")
      .single();
    if (error || !row) throw new ApiError(500, "media_create_failed", "Could not prepare the upload.");

    const upload = await createUploadTarget(provider!, key, mime, body.size);
    return { id: row.id as string, upload };
  },
);
