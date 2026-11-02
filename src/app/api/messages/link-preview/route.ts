import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { z } from "zod";
import { handler } from "@/lib/api/handler";
import { ApiError } from "@/lib/api/errors";
import type { LinkPreview } from "@/components/chat/types";

const MAX_BYTES = 512 * 1024;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 5000;

function ipv4Private(ip: string): boolean {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  return (
    a === 0 || // unspecified / "this network"
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // link-local
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && (p[2] === 0 || p[2] === 2)) ||
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    (a === 198 && b === 51 && p[2] === 100) ||
    (a === 203 && b === 0 && p[2] === 113) ||
    a >= 224 // multicast + reserved + broadcast
  );
}

function ipv6Private(ip: string): boolean {
  const lower = ip.toLowerCase().split("%")[0];
  const mapped = lower.match(/^(?:0*:)*:?ffff:(\d+\.\d+\.\d+\.\d+)$/) ?? lower.match(/^::(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return ipv4Private(mapped[1]);
  const hexMapped = lower.match(/^(?:0*:)*:?ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (hexMapped) {
    const hi = parseInt(hexMapped[1], 16);
    const lo = parseInt(hexMapped[2], 16);
    return ipv4Private(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
  }
  if (lower === "::" || lower === "::1") return true;
  const first = parseInt(lower.split(":")[0] || "0", 16);
  return (
    (first & 0xfe00) === 0xfc00 || // unique local fc00::/7
    (first & 0xffc0) === 0xfe80 || // link-local fe80::/10
    (first & 0xffc0) === 0xfec0 || // site-local (deprecated)
    (first & 0xff00) === 0xff00 || // multicast
    first === 0x2001 && lower.startsWith("2001:db8") || // documentation
    first === 0x64 && lower.startsWith("64:ff9b") || // NAT64 may reach private v4
    first === 0 // other reserved ::/8 forms
  );
}

function isPrivateIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return ipv4Private(ip);
  if (v === 6) return ipv6Private(ip);
  return true;
}

async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ApiError(400, "invalid_url", "That link is not valid.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new ApiError(400, "invalid_url", "Only web links can be previewed.");
  if (url.username || url.password) throw new ApiError(400, "invalid_url", "That link is not valid.");
  const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
  if (port !== 80 && port !== 443) throw new ApiError(400, "invalid_url", "That link can't be previewed.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    throw new ApiError(400, "invalid_url", "That link can't be previewed.");
  }
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true, verbatim: true }).catch(() => []);
  if (addresses.length === 0 || addresses.some((a) => isPrivateIp(a.address))) {
    throw new ApiError(400, "invalid_url", "That link can't be previewed.");
  }
  return url;
}

async function readLimited(res: Response): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (total < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done || !value) break;
    chunks.push(value);
    total += value.byteLength;
  }
  await reader.cancel().catch(() => undefined);
  const buf = new Uint8Array(Math.min(total, MAX_BYTES));
  let offset = 0;
  for (const c of chunks) {
    const slice = c.subarray(0, Math.max(0, buf.length - offset));
    buf.set(slice, offset);
    offset += slice.length;
    if (offset >= buf.length) break;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(buf);
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

function clean(value: string | undefined | null, max: number): string | null {
  if (!value) return null;
  const text = value
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) && code > 31 && code < 0x10ffff ? String.fromCodePoint(code) : "";
      }
      return ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text ? text.slice(0, max) : null;
}

function metaContent(html: string, key: string): string | null {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const name = tag.match(/\b(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
    if (name === key) return tag.match(/\bcontent\s*=\s*"([^"]*)"/i)?.[1] ?? tag.match(/\bcontent\s*=\s*'([^']*)'/i)?.[1] ?? null;
  }
  return null;
}

/**
 * GET /api/messages/link-preview?url= — SSRF-safe title/description fetch.
 * Text only: no remote images (blocked by CSP and a privacy leak).
 */
export const GET = handler(
  { query: z.object({ url: z.string().min(8).max(2048) }), rateLimit: { name: "messages.link_preview", limit: 30, window: 60 } },
  async ({ query }) => {
    let url = await assertPublicUrl(query.url);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      let res: Response | null = null;
      for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        res = await fetch(url, {
          redirect: "manual",
          signal: controller.signal,
          headers: { "User-Agent": "QuickChatLinkPreview/1.0", Accept: "text/html,application/xhtml+xml" },
          cache: "no-store",
        });
        if (res.status >= 300 && res.status < 400) {
          const location = res.headers.get("location");
          await res.body?.cancel().catch(() => undefined);
          if (!location || hop === MAX_REDIRECTS) throw new ApiError(422, "preview_unavailable", "No preview available.");
          url = await assertPublicUrl(new URL(location, url).toString());
          continue;
        }
        break;
      }
      if (!res || !res.ok || !/text\/html|application\/xhtml/i.test(res.headers.get("content-type") ?? "")) {
        await res?.body?.cancel().catch(() => undefined);
        throw new ApiError(422, "preview_unavailable", "No preview available.");
      }
      const html = await readLimited(res);
      const title = clean(metaContent(html, "og:title") ?? metaContent(html, "twitter:title") ?? html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1], 200);
      const description = clean(metaContent(html, "og:description") ?? metaContent(html, "description") ?? metaContent(html, "twitter:description"), 300);
      const preview: LinkPreview = { url: url.toString(), title, description, domain: url.hostname.replace(/^www\./, "") };
      return preview;
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new ApiError(422, "preview_unavailable", "No preview available.");
    } finally {
      clearTimeout(timer);
    }
  },
);
