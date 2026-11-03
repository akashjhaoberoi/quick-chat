import { test } from "@playwright/test";
import { canCreateUsers, createUser, deleteUsers, expect, login, NEEDS_USERS, trackErrors, type TestUser } from "../support/fixtures";

/** Every main screen renders real content for a signed-in user: no blank page, error boundary or console error. */
const ROUTES = [
  "/home", "/chats", "/chats/starred", "/snaps", "/stories", "/camera", "/discover", "/discover/new",
  "/friends", "/search", "/notifications", "/calls", "/profile",
  "/settings", "/settings/account", "/settings/appearance", "/settings/blocked",
  "/settings/media", "/settings/notifications", "/settings/privacy", "/settings/security",
];

test.describe("signed-in screens", () => {
  test.skip(!canCreateUsers, NEEDS_USERS);
  let user: TestUser;
  test.beforeAll(async () => {
    user = await createUser();
  });
  test.afterAll(async () => deleteUsers(user));

  test("all main routes render without errors", async ({ page }) => {
    test.setTimeout(180_000);
    const errors = trackErrors(page);
    await login(page, user);
    const failures: string[] = [];
    for (const route of ROUTES) {
      const before = errors.length;
      const res = await page.goto(route);
      await page.waitForLoadState("networkidle").catch(() => undefined);
      const status = res?.status() ?? 0;
      const text = (await page.locator("main, [role=main], body").first().innerText().catch(() => "")).trim();
      const boundary = await page.getByText(/something went wrong|application error/i).count();
      if (status >= 400 || text.length < 20 || boundary > 0 || !page.url().includes(route.split("?")[0])) {
        failures.push(`${route}: status=${status} url=${page.url()} textLen=${text.length} boundary=${boundary}`);
      }
      if (errors.length > before) failures.push(`${route}: ${errors.slice(before).join(" | ")}`);
    }
    expect(failures).toEqual([]);
  });
});
