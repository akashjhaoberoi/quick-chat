import "server-only";
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { integrationStatus, serverEnv } from "@/lib/env";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Media storage abstraction. Cloudflare R2 is preferred for scale; Supabase
 * Storage (private bucket) is the fallback so the app works with only
 * Supabase configured. Objects are never public: every read goes through
 * /api/media/:id, which authorizes and issues a short-lived signed URL.
 */
export type StorageProvider = "r2" | "supabase";

export type UploadTarget = { url: string; method: "PUT"; headers: Record<string, string> };

let s3: S3Client | null = null;

function r2(): S3Client {
  const env = serverEnv();
  if (!s3) {
    s3 = new S3Client({
      region: "auto",
      endpoint: `https://${env.CLOUDFLARE_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: env.CLOUDFLARE_R2_ACCESS_KEY_ID!, secretAccessKey: env.CLOUDFLARE_R2_SECRET_ACCESS_KEY! },
    });
  }
  return s3;
}

const bucket = () => serverEnv().CLOUDFLARE_R2_BUCKET_NAME!;
const sbBucket = () => serverEnv().SUPABASE_STORAGE_BUCKET;

export function activeProvider(): StorageProvider | null {
  return integrationStatus().storage;
}

export async function createUploadTarget(provider: StorageProvider, key: string, mime: string, size: number): Promise<UploadTarget> {
  if (provider === "r2") {
    const url = await getSignedUrl(
      r2(),
      new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: mime, ContentLength: size }),
      { expiresIn: 600 },
    );
    return { url, method: "PUT", headers: { "Content-Type": mime } };
  }
  const { data, error } = await getSupabaseAdmin().storage.from(sbBucket()).createSignedUploadUrl(key);
  if (error || !data) throw new Error(`createSignedUploadUrl failed: ${error?.message}`);
  return { url: data.signedUrl, method: "PUT", headers: { "Content-Type": mime, "x-upsert": "false" } };
}

export async function objectInfo(provider: StorageProvider, key: string): Promise<{ size: number; contentType: string | null } | null> {
  if (provider === "r2") {
    try {
      const res = await r2().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
      return { size: Number(res.ContentLength ?? 0), contentType: res.ContentType ?? null };
    } catch {
      return null;
    }
  }
  const { data, error } = await getSupabaseAdmin().storage.from(sbBucket()).info(key);
  if (error || !data) return null;
  const meta = data as { size?: number; contentType?: string; metadata?: { size?: number; mimetype?: string } };
  return { size: Number(meta.size ?? meta.metadata?.size ?? 0), contentType: meta.contentType ?? meta.metadata?.mimetype ?? null };
}

export async function readObjectHead(provider: StorageProvider, key: string, bytes = 64): Promise<Uint8Array | null> {
  try {
    const url = await signedReadUrl(provider, key, 60);
    const res = await fetch(url, { headers: { Range: `bytes=0-${bytes - 1}` } });
    if (!res.ok && res.status !== 206) return null;
    return new Uint8Array(await res.arrayBuffer()).slice(0, bytes);
  } catch {
    return null;
  }
}

export async function signedReadUrl(provider: StorageProvider, key: string, ttlSeconds: number, downloadName?: string): Promise<string> {
  const ttl = Math.max(30, Math.min(Math.floor(ttlSeconds), 3600));
  if (provider === "r2") {
    return getSignedUrl(
      r2(),
      new GetObjectCommand({
        Bucket: bucket(),
        Key: key,
        ResponseContentDisposition: downloadName ? `attachment; filename="${downloadName.replace(/["\\\r\n]/g, "_")}"` : undefined,
      }),
      { expiresIn: ttl },
    );
  }
  const { data, error } = await getSupabaseAdmin()
    .storage.from(sbBucket())
    .createSignedUrl(key, ttl, downloadName ? { download: downloadName } : undefined);
  if (error || !data) throw new Error(`createSignedUrl failed: ${error?.message}`);
  return data.signedUrl;
}

export async function deleteObjects(provider: StorageProvider, keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  if (provider === "r2") {
    for (let i = 0; i < keys.length; i += 1000) {
      await r2().send(
        new DeleteObjectsCommand({ Bucket: bucket(), Delete: { Objects: keys.slice(i, i + 1000).map((Key) => ({ Key })), Quiet: true } }),
      );
    }
    return;
  }
  for (let i = 0; i < keys.length; i += 500) {
    const { error } = await getSupabaseAdmin().storage.from(sbBucket()).remove(keys.slice(i, i + 500));
    if (error) throw new Error(`storage remove failed: ${error.message}`);
  }
}
