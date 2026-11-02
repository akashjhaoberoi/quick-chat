import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { z } from "zod";

/**
 * Exercises the real API wrapper (auth, admin role + MFA, CSRF origin check,
 * maintenance mode, rate limiting, validation, DB error mapping) with a fake
 * Supabase client.
 */
type FakeOptions = {
  claims?: Record<string, unknown> | null;
  adminRole?: string | null;
  maintenance?: { enabled: boolean; message?: string };
};

function fakeSupabase(opts: FakeOptions) {
  return {
    auth: { getClaims: async () => ({ data: opts.claims ? { claims: opts.claims } : null, error: null }) },
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () =>
            table === "admin_roles"
              ? { data: opts.adminRole ? { role: opts.adminRole } : null, error: null }
              : { data: { value: opts.maintenance ?? { enabled: false } }, error: null },
        }),
      }),
    }),
  };
}

async function load(opts: FakeOptions, env: Record<string, string> = {}) {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "http://localhost:3000");
  vi.stubEnv("ADMIN_REQUIRE_MFA", "true");
  for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
  vi.doMock("@/lib/supabase/server", () => ({ createSupabaseServerClient: async () => fakeSupabase(opts) }));
  return import("@/lib/api/handler");
}

function req(method: string, body?: unknown, headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost:3000/api/test", {
    method,
    headers: { "content-type": "application/json", origin: "http://localhost:3000", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const USER = { sub: "11111111-1111-4111-8111-111111111111", email: "a@b.c", aal: "aal1" };

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("handler()", () => {
  it("rejects unauthenticated requests with 401", async () => {
    const { handler } = await load({ claims: null });
    const res = await handler({}, async () => "ok")(req("GET"));
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ ok: false, error: { code: "not_authenticated" } });
  });

  it("passes the authenticated user to the route and wraps the result", async () => {
    const { handler } = await load({ claims: USER });
    const res = await handler({}, async ({ user }) => ({ id: user.id }))(req("GET"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, data: { id: USER.sub } });
  });

  it("blocks cross-site mutating requests (CSRF)", async () => {
    const { handler } = await load({ claims: USER });
    const res = await handler({}, async () => "ok")(req("POST", {}, { origin: "https://evil.example" }));
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("invalid_origin");
  });

  it("blocks requests whose Sec-Fetch-Site says cross-site even without Origin", async () => {
    const { handler } = await load({ claims: USER });
    const r = new NextRequest("http://localhost:3000/api/test", {
      method: "POST",
      headers: { "sec-fetch-site": "cross-site", "content-type": "application/json" },
      body: "{}",
    });
    const res = await handler({}, async () => "ok")(r);
    expect(res.status).toBe(403);
  });

  it("validates bodies with zod and returns field details", async () => {
    const { handler } = await load({ claims: USER });
    const res = await handler({ body: z.object({ name: z.string().min(3) }) }, async () => "ok")(req("POST", { name: "x" }));
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error.code).toBe("validation_failed");
    expect(json.error.details[0].path).toBe("name");
  });

  it("rejects malformed JSON", async () => {
    const { handler } = await load({ claims: USER });
    const r = new NextRequest("http://localhost:3000/api/test", {
      method: "POST",
      headers: { origin: "http://localhost:3000", "content-type": "application/json" },
      body: "{not json",
    });
    const res = await handler({ body: z.object({}) }, async () => "ok")(r);
    expect(res.status).toBe(400);
  });

  it("maps database errors raised by RPCs to HTTP statuses", async () => {
    const { handler, unwrap } = await load({ claims: USER });
    const route = handler({}, async () => unwrap({ data: null, error: { code: "P0002", message: "conversation_not_found" } }));
    const res = await route(req("GET"));
    expect(res.status).toBe(404);
    expect((await res.json()).error).toMatchObject({ code: "conversation_not_found", message: "Conversation not found." });
  });

  it("hides unexpected errors behind a generic 500", async () => {
    const { handler } = await load({ claims: USER });
    const res = await handler({}, async () => {
      throw new Error("secret internal detail");
    })(req("GET"));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("secret internal detail");
  });

  describe("admin routes", () => {
    it("forbid regular users", async () => {
      const { handler } = await load({ claims: USER, adminRole: null });
      const res = await handler({ auth: { admin: "moderator" } }, async () => "ok")(req("GET"));
      expect(res.status).toBe(403);
      expect((await res.json()).error.code).toBe("forbidden");
    });

    it("require a sufficient role", async () => {
      const { handler } = await load({ claims: { ...USER, aal: "aal2" }, adminRole: "moderator" });
      const res = await handler({ auth: { admin: "super_admin" } }, async () => "ok")(req("GET"));
      expect(res.status).toBe(403);
    });

    it("require two-factor (aal2) when ADMIN_REQUIRE_MFA is on", async () => {
      const { handler } = await load({ claims: USER, adminRole: "admin" });
      const res = await handler({ auth: { admin: "moderator" } }, async () => "ok")(req("GET"));
      expect(res.status).toBe(403);
      expect((await res.json()).error.code).toBe("mfa_required");
    });

    it("allow admins with aal2", async () => {
      const { handler } = await load({ claims: { ...USER, aal: "aal2" }, adminRole: "admin" });
      const res = await handler({ auth: { admin: "moderator" } }, async ({ adminRole }) => adminRole)(req("GET"));
      expect(res.status).toBe(200);
      expect((await res.json()).data).toBe("admin");
    });

    it("can disable the MFA requirement for local development", async () => {
      const { handler } = await load({ claims: USER, adminRole: "admin" }, { ADMIN_REQUIRE_MFA: "false" });
      const res = await handler({ auth: { admin: "moderator" } }, async () => "ok")(req("GET"));
      expect(res.status).toBe(200);
    });
  });

  it("returns 503 for non-admin writes during maintenance", async () => {
    const { handler } = await load({ claims: USER, adminRole: null, maintenance: { enabled: true, message: "Back soon" } });
    const res = await handler({}, async () => "ok")(req("POST", {}));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatchObject({ code: "maintenance", message: "Back soon" });
  });

  it("lets admins write during maintenance", async () => {
    const { handler } = await load({ claims: USER, adminRole: "admin", maintenance: { enabled: true } });
    const res = await handler({}, async () => "ok")(req("POST", {}));
    expect(res.status).toBe(200);
  });

  it("rate limits per user", async () => {
    const { handler } = await load({ claims: USER });
    const route = handler({ rateLimit: { name: `t-${Math.random()}`, limit: 2, window: 60 } }, async () => "ok");
    expect((await route(req("GET"))).status).toBe(200);
    expect((await route(req("GET"))).status).toBe(200);
    const limited = await route(req("GET"));
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBeTruthy();
  });

  describe("cron routes", () => {
    it("are disabled without CRON_SECRET", async () => {
      const { handler } = await load({ claims: null });
      const res = await handler({ auth: "cron" }, async () => "ok")(req("GET"));
      expect(res.status).toBe(503);
    });

    it("require the bearer secret", async () => {
      const { handler } = await load({ claims: null }, { CRON_SECRET: "s3cret" });
      const bad = await handler({ auth: "cron" }, async () => "ok")(req("GET", undefined, { authorization: "Bearer nope" }));
      expect(bad.status).toBe(401);
      const good = await handler({ auth: "cron" }, async () => "ok")(req("GET", undefined, { authorization: "Bearer s3cret" }));
      expect(good.status).toBe(200);
    });
  });
});
