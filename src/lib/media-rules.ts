/**
 * Upload policy shared by the browser (pre-flight checks) and the server
 * (authoritative checks). SVG and HTML are never accepted (script injection).
 */
export type MediaKind = "image" | "video" | "audio" | "document";
export type MediaPurpose = "avatar" | "cover" | "message" | "snap" | "story" | "post" | "group_avatar";

export const MIME_KIND: Record<string, MediaKind> = {
  "image/jpeg": "image",
  "image/png": "image",
  "image/webp": "image",
  "image/gif": "image",
  "image/heic": "image",
  "image/heif": "image",
  "video/mp4": "video",
  "video/webm": "video",
  "video/quicktime": "video",
  "audio/webm": "audio",
  "audio/ogg": "audio",
  "audio/mpeg": "audio",
  "audio/mp4": "audio",
  "audio/aac": "audio",
  "audio/wav": "audio",
  "application/pdf": "document",
  "text/plain": "document",
  "application/zip": "document",
  "application/msword": "document",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "document",
  "application/vnd.ms-excel": "document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "document",
  "application/vnd.ms-powerpoint": "document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "document",
};

export const MAX_BYTES: Record<MediaKind, number> = {
  image: 15 * 1024 * 1024,
  video: 100 * 1024 * 1024,
  audio: 20 * 1024 * 1024,
  document: 25 * 1024 * 1024,
};

export const DAILY_UPLOAD_BYTES = 1024 * 1024 * 1024;

/** Premium "extended_uploads" limits (video stays at the storage bucket's 100 MB cap). */
export const MAX_BYTES_PREMIUM: Record<MediaKind, number> = {
  image: 30 * 1024 * 1024,
  video: 100 * 1024 * 1024,
  audio: 40 * 1024 * 1024,
  document: 50 * 1024 * 1024,
};
export const DAILY_UPLOAD_BYTES_PREMIUM = 5 * 1024 * 1024 * 1024;

const PURPOSE_KINDS: Record<MediaPurpose, MediaKind[]> = {
  avatar: ["image"],
  cover: ["image"],
  group_avatar: ["image"],
  message: ["image", "video", "audio", "document"],
  snap: ["image", "video"],
  story: ["image", "video"],
  post: ["image", "video"],
};

/** Strips parameters such as `;codecs=opus` that MediaRecorder adds. */
export function baseMime(mime: string): string {
  return mime.split(";")[0].trim().toLowerCase();
}

/**
 * `premium` selects the extended limits. The browser pre-checks with the
 * larger limits; the server decides with the user's real entitlement.
 */
export function validateUpload(
  mime: string,
  size: number,
  purpose: MediaPurpose,
  premium = false,
): { ok: true; kind: MediaKind } | { ok: false; reason: string } {
  const limits = premium ? MAX_BYTES_PREMIUM : MAX_BYTES;
  const kind = MIME_KIND[baseMime(mime)];
  if (!kind) return { ok: false, reason: "This file type isn't supported." };
  if (!PURPOSE_KINDS[purpose].includes(kind)) return { ok: false, reason: `A ${kind} can't be used here.` };
  if (size <= 0) return { ok: false, reason: "The file is empty." };
  if (size > limits[kind]) {
    const upgrade = !premium && MAX_BYTES_PREMIUM[kind] > MAX_BYTES[kind] ? ` Premium raises this to ${Math.round(MAX_BYTES_PREMIUM[kind] / 1024 / 1024)} MB.` : "";
    return { ok: false, reason: `Files of this type must be under ${Math.round(limits[kind] / 1024 / 1024)} MB.${upgrade}` };
  }
  return { ok: true, kind };
}

export function extensionFor(mime: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif", "image/heic": "heic", "image/heif": "heif",
    "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov",
    "audio/webm": "weba", "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/mp4": "m4a", "audio/aac": "aac", "audio/wav": "wav",
    "application/pdf": "pdf", "text/plain": "txt", "application/zip": "zip",
  };
  return map[baseMime(mime)] ?? "bin";
}

/**
 * Checks the first bytes of an uploaded object against the declared type so
 * a renamed executable/HTML file cannot masquerade as an image.
 */
export function sniffMatches(mime: string, head: Uint8Array): boolean {
  const m = baseMime(mime);
  const b = (i: number) => head[i];
  const ascii = (start: number, len: number) => String.fromCharCode(...head.slice(start, start + len));
  if (head.length < 4) return false;
  switch (m) {
    case "image/jpeg":
      return b(0) === 0xff && b(1) === 0xd8 && b(2) === 0xff;
    case "image/png":
      return b(0) === 0x89 && ascii(1, 3) === "PNG";
    case "image/gif":
      return ascii(0, 4) === "GIF8";
    case "image/webp":
      return ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP";
    case "audio/wav":
      return ascii(0, 4) === "RIFF" && ascii(8, 4) === "WAVE";
    case "image/heic":
    case "image/heif":
    case "video/mp4":
    case "video/quicktime":
    case "audio/mp4":
      return ascii(4, 4) === "ftyp";
    case "video/webm":
    case "audio/webm":
      return b(0) === 0x1a && b(1) === 0x45 && b(2) === 0xdf && b(3) === 0xa3;
    case "audio/ogg":
      return ascii(0, 4) === "OggS";
    case "audio/mpeg":
      return ascii(0, 3) === "ID3" || (b(0) === 0xff && (b(1) & 0xe0) === 0xe0);
    case "audio/aac":
      return b(0) === 0xff && (b(1) & 0xf0) === 0xf0;
    case "application/pdf":
      return ascii(0, 5) === "%PDF-";
    case "application/zip":
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    case "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
    case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
      return b(0) === 0x50 && b(1) === 0x4b;
    case "application/msword":
    case "application/vnd.ms-excel":
    case "application/vnd.ms-powerpoint":
      return b(0) === 0xd0 && b(1) === 0xcf && b(2) === 0x11 && b(3) === 0xe0;
    case "text/plain": {
      const text = new TextDecoder("utf-8", { fatal: false }).decode(head).toLowerCase();
      return !text.includes("<script") && !text.includes("<html") && !head.includes(0);
    }
    default:
      return false;
  }
}
