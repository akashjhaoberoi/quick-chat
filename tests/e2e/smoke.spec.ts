import { expect, test } from "@playwright/test";

/**
 * Smoke tests that need no backend. When Supabase isn't configured the app
 * must run in an explicit "setup mode" rather than pretending to work.
 */
const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

test.describe("public surface", () => {
  test("landing page presents the brand and calls to action", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Quick Chat/);
    await expect(page.getByText("Akarika Technologies").first()).toBeVisible();
    await expect(page.getByRole("link", { name: /sign up|create account|get started/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /log in|sign in/i }).first()).toBeVisible();
  });

  test("landing page has no horizontal overflow on small screens", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    await page.goto("/");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test("privacy policy is honest about encryption", async ({ page }) => {
    await page.goto("/legal/privacy");
    await expect(page.getByText(/not end-to-end encrypted/i).first()).toBeVisible();
  });

  test("offline fallback page renders", async ({ page }) => {
    await page.goto("/offline");
    await expect(page.getByRole("heading", { name: /offline/i })).toBeVisible();
  });
});

test.describe("security & PWA", () => {
  test("sends security headers", async ({ request }) => {
    const res = await request.get("/");
    const headers = res.headers();
    expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["strict-transport-security"]).toContain("max-age");
    expect(headers["x-powered-by"]).toBeUndefined();
  });

  test("serves an installable web app manifest with icons", async ({ request }) => {
    const res = await request.get("/manifest.webmanifest");
    expect(res.ok()).toBe(true);
    const manifest = await res.json();
    expect(manifest.name).toBe("Quick Chat");
    expect(manifest.display).toBe("standalone");
    for (const icon of manifest.icons) {
      expect((await request.get(icon.src)).ok()).toBe(true);
    }
  });

  test("serves the service worker uncached and without API caching", async ({ request }) => {
    const res = await request.get("/sw.js");
    expect(res.ok()).toBe(true);
    expect(res.headers()["cache-control"]).toContain("no-cache");
    const body = await res.text();
    expect(body).toContain('url.pathname.startsWith("/api/")');
  });

  test("API responses use the JSON envelope and are never cached", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.ok()).toBe(true);
    expect(res.headers()["cache-control"]).toContain("no-store");
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.data.integrations).toHaveProperty("livekit");
    expect(JSON.stringify(json)).not.toMatch(/secret|service_role/i);
  });

  test("protected API routes reject anonymous callers", async ({ request }) => {
    const res = await request.get("/api/users/me");
    expect([401, 503]).toContain(res.status());
    const json = await res.json();
    expect(json.ok).toBe(false);
  });

  test("cross-site POSTs are rejected", async ({ request }) => {
    const res = await request.post("/api/reports", {
      headers: { origin: "https://evil.example", "content-type": "application/json" },
      data: {},
    });
    expect(res.status()).toBe(403);
  });

  test("cron endpoint requires its secret", async ({ request }) => {
    const res = await request.get("/api/cron/cleanup");
    expect([401, 503]).toContain(res.status());
  });
});

test.describe("routing", () => {
  test("app routes are protected", async ({ page }) => {
    await page.goto("/home");
    await expect(page).toHaveURL(configured ? /\/login/ : /\/setup/);
  });

  test("admin is protected", async ({ page }) => {
    await page.goto("/admin");
    await expect(page).toHaveURL(configured ? /\/login/ : /\/setup/);
  });

  test("setup mode explains what to configure", async ({ page }) => {
    test.skip(configured, "Only relevant when Supabase is not configured");
    await page.goto("/setup");
    await expect(page.getByText("NEXT_PUBLIC_SUPABASE_URL").first()).toBeVisible();
  });

  test("auth pages render", async ({ page }) => {
    test.skip(!configured, "Auth pages redirect to /setup without Supabase");
    for (const path of ["/login", "/register", "/forgot-password"]) {
      await page.goto(path);
      await expect(page.getByRole("button").first()).toBeVisible();
    }
  });
});
