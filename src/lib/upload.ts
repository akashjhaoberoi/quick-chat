"use client";

import { api, ClientApiError } from "@/lib/api/client";
import { validateUpload, type MediaPurpose } from "@/lib/media-rules";

export type UploadedMedia = { id: string; kind: "image" | "video" | "audio" | "document"; mime: string; size: number };

export type UploadHandle = {
  promise: Promise<UploadedMedia>;
  cancel: () => void;
};

type UploadOptions = {
  purpose: MediaPurpose;
  onProgress?: (fraction: number) => void;
  /** Image compression (default: on for images that aren't GIFs). */
  compress?: boolean;
  width?: number;
  height?: number;
  durationMs?: number;
};

const MAX_DIMENSION = 2048;

/** Downscales and re-encodes large photos in the browser before upload. */
export async function compressImage(file: Blob, maxDimension = MAX_DIMENSION, quality = 0.85): Promise<{ blob: Blob; width: number; height: number }> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return { blob: file, width: 0, height: 0 };
  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  if (scale === 1 && file.size < 1.5 * 1024 * 1024 && file.type === "image/jpeg") {
    bitmap.close();
    return { blob: file, width, height };
  }
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  return { blob: blob && blob.size < file.size ? blob : file, width, height };
}

export async function mediaDimensions(file: Blob): Promise<{ width?: number; height?: number; durationMs?: number }> {
  if (file.type.startsWith("image/")) {
    const bmp = await createImageBitmap(file).catch(() => null);
    if (!bmp) return {};
    const out = { width: bmp.width, height: bmp.height };
    bmp.close();
    return out;
  }
  if (file.type.startsWith("video/") || file.type.startsWith("audio/")) {
    return new Promise((resolve) => {
      const el = document.createElement(file.type.startsWith("video/") ? "video" : "audio");
      const url = URL.createObjectURL(file);
      el.preload = "metadata";
      el.onloadedmetadata = () => {
        const v = el as HTMLVideoElement;
        resolve({
          width: v.videoWidth || undefined,
          height: v.videoHeight || undefined,
          durationMs: Number.isFinite(el.duration) ? Math.round(el.duration * 1000) : undefined,
        });
        URL.revokeObjectURL(url);
      };
      el.onerror = () => {
        resolve({});
        URL.revokeObjectURL(url);
      };
      el.src = url;
    });
  }
  return {};
}

/**
 * Uploads a file directly to storage:
 *   1. POST /api/media/upload-url  → server validates and returns a signed PUT URL
 *   2. PUT bytes with XHR          → progress + cancellation
 *   3. POST /api/media/:id/complete → server verifies size and file signature
 */
export function uploadMedia(input: File | Blob, opts: UploadOptions): UploadHandle {
  let xhr: XMLHttpRequest | null = null;
  let cancelled = false;

  const promise = (async () => {
    let file: Blob = input;
    let width = opts.width;
    let height = opts.height;
    let durationMs = opts.durationMs;
    const fileName = input instanceof File ? input.name : undefined;

    if (file.type.startsWith("image/") && file.type !== "image/gif" && opts.compress !== false) {
      const c = await compressImage(file);
      file = c.blob;
      width = width ?? (c.width || undefined);
      height = height ?? (c.height || undefined);
    } else if (width === undefined && durationMs === undefined) {
      const d = await mediaDimensions(file);
      width = d.width;
      height = d.height;
      durationMs = d.durationMs;
    }

    const check = validateUpload(file.type, file.size, opts.purpose);
    if (!check.ok) throw new ClientApiError(400, "invalid_file", check.reason);
    if (cancelled) throw new ClientApiError(0, "cancelled", "Upload cancelled.");

    const target = await api.post<{ id: string; upload: { url: string; method: "PUT"; headers: Record<string, string> } }>(
      "/api/media/upload-url",
      { purpose: opts.purpose, mime: file.type, size: file.size, fileName, width, height, durationMs },
    );

    await new Promise<void>((resolve, reject) => {
      xhr = new XMLHttpRequest();
      xhr.open(target.upload.method, target.upload.url);
      for (const [k, v] of Object.entries(target.upload.headers)) xhr.setRequestHeader(k, v);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) opts.onProgress?.(e.loaded / e.total);
      };
      xhr.onload = () => (xhr!.status >= 200 && xhr!.status < 300 ? resolve() : reject(new ClientApiError(xhr!.status, "upload_failed", "Upload failed. Please try again.")));
      xhr.onerror = () => reject(new ClientApiError(0, "upload_failed", "Upload failed. Check your connection."));
      xhr.onabort = () => reject(new ClientApiError(0, "cancelled", "Upload cancelled."));
      xhr.send(file);
    });

    opts.onProgress?.(1);
    await api.post(`/api/media/${target.id}/complete`);
    return { id: target.id, kind: check.kind, mime: file.type, size: file.size };
  })();

  return {
    promise,
    cancel: () => {
      cancelled = true;
      (xhr as XMLHttpRequest | null)?.abort();
    },
  };
}
