import { afterEach, describe, expect, it, vi } from "vitest";
import { compactNumber, formatBytes, formatDuration, initials, isOnline, linkify, mediaUrl, firstUrl } from "@/lib/utils";

describe("linkify", () => {
  it("splits text into text and link segments without interpreting HTML", () => {
    const parts = linkify("see https://example.com/a?b=1, and <b>bold</b>");
    expect(parts).toEqual([
      { type: "text", value: "see " },
      { type: "link", value: "https://example.com/a?b=1" },
      { type: "text", value: ", and <b>bold</b>" },
    ]);
  });
  it("ignores javascript: and other non-http schemes", () => {
    expect(linkify("javascript:alert(1)").every((p) => p.type === "text")).toBe(true);
  });
  it("finds the first URL", () => {
    expect(firstUrl("a http://x.io b https://y.io")).toBe("http://x.io");
    expect(firstUrl("none")).toBeNull();
  });
});

describe("formatting helpers", () => {
  it("formats durations", () => {
    expect(formatDuration(5)).toBe("0:05");
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(3725)).toBe("1:02:05");
  });
  it("formats bytes and numbers", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(10 * 1024 * 1024)).toBe("10 MB");
    expect(compactNumber(1500)).toBe("1.5K");
  });
  it("builds initials and media URLs", () => {
    expect(initials("Ada Lovelace")).toBe("AL");
    expect(initials("")).toBe("?");
    expect(mediaUrl(null)).toBeUndefined();
    expect(mediaUrl("abc", { download: true })).toBe("/api/media/abc?download=1");
  });
  it("treats users seen in the last two minutes as online", () => {
    expect(isOnline(new Date().toISOString())).toBe(true);
    expect(isOnline(new Date(Date.now() - 5 * 60_000).toISOString())).toBe(false);
    expect(isOnline(null)).toBe(false);
  });
});

describe("environment validation", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("reports missing mandatory Supabase configuration", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "");
    const { validateEnvironment } = await import("@/lib/env");
    const { errors } = validateEnvironment();
    expect(errors.join(" ")).toContain("NEXT_PUBLIC_SUPABASE_URL");
  });

  it("refuses secrets exposed through NEXT_PUBLIC_ variables", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY", "oops");
    const { validateEnvironment } = await import("@/lib/env");
    expect(validateEnvironment().errors.some((e) => e.includes("exposed to the browser"))).toBe(true);
  });

  it("detects which optional integrations are configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://x.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service");
    vi.stubEnv("LIVEKIT_URL", "wss://x.livekit.cloud");
    vi.stubEnv("LIVEKIT_API_KEY", "k");
    vi.stubEnv("LIVEKIT_API_SECRET", "s");
    vi.stubEnv("CLOUDFLARE_ACCOUNT_ID", "");
    const { integrationStatus } = await import("@/lib/env");
    const s = integrationStatus();
    expect(s.supabase).toBe(true);
    expect(s.livekit).toBe(true);
    expect(s.storage).toBe("supabase");
    expect(s.push).toBe(false);
  });
});

describe("rate limiter (in-memory fallback)", () => {
  it("allows up to the limit per window and then blocks", async () => {
    vi.stubEnv("REDIS_URL", "");
    vi.resetModules();
    const { rateLimit } = await import("@/lib/rate-limit");
    const key = `test-${Math.random()}`;
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await rateLimit(key, 3, 60));
    expect(results.map((r) => r.ok)).toEqual([true, true, true, false]);
    expect(results[3].remaining).toBe(0);
    vi.unstubAllEnvs();
  });
});
