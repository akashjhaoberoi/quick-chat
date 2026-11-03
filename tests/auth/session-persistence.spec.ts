import { test } from "@playwright/test";
import { canCreateUsers, createUser, deleteUsers, expect, login, NEEDS_USERS, type TestUser } from "../support/fixtures";

test.describe("session persistence", () => {
  test.skip(!canCreateUsers, NEEDS_USERS);
  let user: TestUser;
  test.beforeAll(async () => {
    user = await createUser();
  });
  test.afterAll(async () => deleteUsers(user));

  test("survives a reload", async ({ page }) => {
    await login(page, user);
    await page.reload();
    await expect(page).toHaveURL(/\/home/);
  });

  test("survives a browser restart when Remember me is on", async ({ browser, page, context }) => {
    await login(page, user);
    const auth = (await context.cookies()).filter((c) => c.name.startsWith("sb-"));
    expect(auth.length).toBeGreaterThan(0);
    for (const c of auth) expect(c.expires).toBeGreaterThan(Date.now() / 1000 + 86_400);
    // A new context with only the persistent cookies is a restarted browser.
    const restarted = await browser.newContext({ storageState: await context.storageState() });
    const p = await restarted.newPage();
    await p.goto("/home");
    await expect(p).toHaveURL(/\/home/);
    await restarted.close();
  });

  test("uses browser-session cookies when Remember me is off", async ({ page, context }) => {
    await login(page, user, { remember: false });
    const auth = (await context.cookies()).filter((c) => /^sb-.*-auth-token/.test(c.name));
    expect(auth.length).toBeGreaterThan(0);
    for (const c of auth) expect(c.expires).toBe(-1);
  });

  test("auth cookies are Lax and Secure in production", async ({ page, context, baseURL, browserName }) => {
    await login(page, user);
    const auth = (await context.cookies()).filter((c) => /^sb-.*-auth-token/.test(c.name));
    for (const c of auth) {
      // Playwright's Windows WebKit build doesn't implement SameSite and reports "None".
      if (!(browserName === "webkit" && process.platform === "win32")) expect(c.sameSite).toBe("Lax");
      if (baseURL?.startsWith("https://")) expect(c.secure).toBe(true);
    }
  });
});
