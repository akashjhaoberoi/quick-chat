import { describe, expect, it } from "vitest";
import { overlaySchema, passwordSchema, registerSchema, reportSchema, sendMessageSchema, usernameSchema } from "@/lib/validation";
import { baseMime, sniffMatches, validateUpload } from "@/lib/media-rules";
import { fromDbError } from "@/lib/api/errors";

describe("username validation", () => {
  it.each(["alice", "bob_99", "a.b.c", "abc"])("accepts %s", (v) => {
    expect(usernameSchema.safeParse(v).success).toBe(true);
  });
  it.each(["ab", "with space", "a..b", ".lead", "trail.", "x".repeat(21), "émoji"])("rejects %s", (v) => {
    expect(usernameSchema.safeParse(v).success).toBe(false);
  });
  it("normalises case", () => {
    expect(usernameSchema.parse("Alice")).toBe("alice");
  });
});

describe("password policy", () => {
  it("requires length, letters and a digit", () => {
    expect(passwordSchema.safeParse("short1").success).toBe(false);
    expect(passwordSchema.safeParse("onlyletterspassword").success).toBe(false);
    expect(passwordSchema.safeParse("1234567890123").success).toBe(false);
    expect(passwordSchema.safeParse("correct horse 9 battery").success).toBe(true);
  });
});

describe("registration", () => {
  it("requires accepting the terms", () => {
    const base = { email: "a@b.co", password: "goodpassword1", username: "alice", displayName: "Alice" };
    expect(registerSchema.safeParse({ ...base, acceptTerms: false }).success).toBe(false);
    expect(registerSchema.safeParse({ ...base, acceptTerms: true }).success).toBe(true);
  });
});

describe("message + overlay + report schemas", () => {
  it("rejects unknown message types and oversized bodies", () => {
    expect(sendMessageSchema.safeParse({ type: "system", body: "x" }).success).toBe(false);
    expect(sendMessageSchema.safeParse({ type: "text", body: "x".repeat(4001) }).success).toBe(false);
    expect(sendMessageSchema.safeParse({ type: "text", body: "hi", clientId: "abc" }).success).toBe(true);
  });
  it("limits attachments to 10 uuids", () => {
    const ids = Array.from({ length: 11 }, () => crypto.randomUUID());
    expect(sendMessageSchema.safeParse({ type: "image", mediaIds: ids }).success).toBe(false);
  });
  it("validates normalised overlay coordinates and colours", () => {
    expect(overlaySchema.safeParse({ type: "text", text: "hi", x: 0.5, y: 0.5, color: "#ffffff", size: 0.05 }).success).toBe(true);
    expect(overlaySchema.safeParse({ type: "text", text: "hi", x: 2, y: 0.5, color: "#ffffff", size: 0.05 }).success).toBe(false);
    expect(overlaySchema.safeParse({ type: "text", text: "hi", x: 0.5, y: 0.5, color: "red", size: 0.05 }).success).toBe(false);
  });
  it("only accepts known report targets/reasons", () => {
    expect(reportSchema.safeParse({ targetType: "message", targetId: crypto.randomUUID(), reason: "spam" }).success).toBe(true);
    expect(reportSchema.safeParse({ targetType: "database", targetId: crypto.randomUUID(), reason: "spam" }).success).toBe(false);
  });
});

describe("upload policy", () => {
  it("accepts allowed types within limits for the purpose", () => {
    expect(validateUpload("image/jpeg", 1000, "avatar")).toEqual({ ok: true, kind: "image" });
    expect(validateUpload("video/mp4", 5_000_000, "snap")).toEqual({ ok: true, kind: "video" });
    expect(validateUpload("audio/webm;codecs=opus", 10_000, "message")).toEqual({ ok: true, kind: "audio" });
  });
  it("rejects SVG/HTML, wrong purposes and oversize files", () => {
    expect(validateUpload("image/svg+xml", 100, "message").ok).toBe(false);
    expect(validateUpload("text/html", 100, "message").ok).toBe(false);
    expect(validateUpload("video/mp4", 100, "avatar").ok).toBe(false);
    expect(validateUpload("application/pdf", 100, "snap").ok).toBe(false);
    expect(validateUpload("image/png", 16 * 1024 * 1024, "message").ok).toBe(false);
    expect(validateUpload("image/png", 0, "message").ok).toBe(false);
  });
  it("normalises MIME parameters", () => {
    expect(baseMime("Video/WebM; codecs=vp9")).toBe("video/webm");
  });
});

describe("file signature sniffing", () => {
  const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(16).fill(0)]);
  const ascii = (s: string, pad = 16) => new Uint8Array([...new TextEncoder().encode(s), ...new Array(pad).fill(0)]);
  it("recognises genuine headers", () => {
    expect(sniffMatches("image/jpeg", bytes(0xff, 0xd8, 0xff, 0xe0))).toBe(true);
    expect(sniffMatches("image/png", bytes(0x89, 0x50, 0x4e, 0x47))).toBe(true);
    expect(sniffMatches("application/pdf", ascii("%PDF-1.7"))).toBe(true);
    expect(sniffMatches("video/mp4", ascii("\0\0\0\x18ftypmp42"))).toBe(true);
    expect(sniffMatches("video/webm", bytes(0x1a, 0x45, 0xdf, 0xa3))).toBe(true);
  });
  it("rejects disguised files", () => {
    expect(sniffMatches("image/jpeg", ascii("<html><script>alert(1)</script>"))).toBe(false);
    expect(sniffMatches("image/png", bytes(0xff, 0xd8, 0xff, 0xe0))).toBe(false);
    expect(sniffMatches("text/plain", ascii("<script>alert(1)</script>"))).toBe(false);
    expect(sniffMatches("application/pdf", ascii("MZ executable"))).toBe(false);
  });
});

describe("database error mapping", () => {
  it.each([
    ["P0002", "message_not_found", 404],
    ["42501", "admins_only", 403],
    ["54000", "rate_limited", 429],
    ["22023", "empty_message", 400],
    ["23505", "username_unavailable", 409],
    ["28000", "not_authenticated", 401],
  ])("%s %s -> %i", (code, message, status) => {
    const e = fromDbError({ code, message });
    expect(e.status).toBe(status);
    expect(e.code).toBe(message);
  });
  it("turns raw permission errors into a generic forbidden", () => {
    const e = fromDbError({ code: "42501", message: "permission denied for table messages" });
    expect(e).toMatchObject({ status: 403, code: "forbidden" });
  });
  it("never leaks unexpected database messages", () => {
    const e = fromDbError({ code: "XX000", message: "internal: relation private.secret does not exist" });
    expect(e.status).toBe(500);
    expect(e.message).not.toContain("private.secret");
  });
});
