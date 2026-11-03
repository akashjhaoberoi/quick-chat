import { test } from "@playwright/test";
import { expect } from "../support/fixtures";

test.describe("installable app", () => {
  test("manifest has the required fields and its icons load", async ({ request }) => {
    const res = await request.get("/manifest.webmanifest");
    expect(res.ok()).toBe(true);
    const m = await res.json();
    expect(m.name).toBe("Quick Chat");
    expect(m.short_name).toBe("Quick Chat");
    expect(m.display).toBe("standalone");
    expect(m.start_url).toBeTruthy();
    expect(m.scope).toBe("/");
    expect(m.theme_color).toBeTruthy();
    expect(m.background_color).toBeTruthy();
    const sizes = m.icons.map((i: { sizes: string }) => i.sizes);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("512x512");
    expect(m.icons.some((i: { purpose?: string }) => i.purpose?.includes("maskable"))).toBe(true);
    for (const icon of m.icons) expect((await request.get(icon.src)).ok(), icon.src).toBe(true);
  });

  test("service worker registers and controls the page", async ({ page, browserName }) => {
    test.skip(browserName === "firefox" && !!process.env.CI, "Firefox SW in CI is flaky");
    await page.goto("/login");
    const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope);
    expect(new URL(scope).pathname).toBe("/");
  });

  test("offline navigation shows the offline page", async ({ page, context, browserName }) => {
    // Playwright's offline emulation doesn't reach Firefox's service worker; checked manually instead.
    test.skip(browserName === "firefox", "Offline emulation doesn't apply to Firefox service workers in Playwright");
    await page.goto("/login");
    await page.evaluate(async () => navigator.serviceWorker.ready);
    await page.reload(); // now controlled by the worker
    await context.setOffline(true);
    await page.goto("/legal/terms").catch(() => undefined);
    await expect(page.getByRole("heading", { name: /offline/i })).toBeVisible();
    await context.setOffline(false);
  });

  test("Chromium: the Install button opens the browser's install prompt", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "beforeinstallprompt is Chromium-only");
    await page.goto("/login");
    // Simulate the browser offering installation (headless browsers never do on their own).
    await page.evaluate(() => {
      const e = new Event("beforeinstallprompt", { cancelable: true }) as Event & Record<string, unknown>;
      (window as unknown as { __prompted: boolean }).__prompted = false;
      e.prompt = async () => {
        (window as unknown as { __prompted: boolean }).__prompted = true;
      };
      e.userChoice = Promise.resolve({ outcome: "accepted" });
      window.dispatchEvent(e);
    });
    const install = page.getByRole("button", { name: /install/i }).first();
    await expect(install).toBeVisible();
    await install.click();
    await expect.poll(() => page.evaluate(() => (window as unknown as { __prompted: boolean }).__prompted)).toBe(true);
    // Installed: the button disappears.
    await expect(page.getByRole("button", { name: /install/i })).toHaveCount(0);
  });

  test("iPhone Safari: the Install button explains Add to Home Screen", async ({ page }, info) => {
    test.skip(info.project.name !== "mobile-ios", "iOS project only");
    await page.goto("/");
    await page.getByRole("button", { name: /install/i }).first().click();
    const dialog = page.getByRole("dialog", { name: "Install Quick Chat" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Add to Home Screen");
  });

  test("no Install button when already running as the installed app", async ({ page }) => {
    await page.addInitScript(() => {
      const original = window.matchMedia.bind(window);
      window.matchMedia = (q: string) =>
        q.includes("display-mode: standalone") ? ({ ...original(q), matches: true, media: q, addEventListener() {}, removeEventListener() {} } as MediaQueryList) : original(q);
    });
    await page.goto("/");
    await expect(page.getByRole("button", { name: /install/i })).toHaveCount(0);
  });

  test("no fake download: unsupported browsers show no Install button", async ({ page, browserName }) => {
    test.skip(browserName !== "firefox", "Firefox desktop cannot install web apps");
    await page.goto("/");
    await expect(page.getByRole("button", { name: /install/i })).toHaveCount(0);
  });
});
