import { test } from "@playwright/test";
import { admin, canCreateUsers, createUser, deleteUsers, expect, login, NEEDS_USERS, type TestUser } from "../support/fixtures";

test.describe("expired, invalid and blocked sessions", () => {
  test.skip(!canCreateUsers, NEEDS_USERS);
  let user: TestUser;
  test.beforeAll(async () => {
    user = await createUser();
  });
  test.afterAll(async () => deleteUsers(user));

  test("an invalid or expired session cookie sends the user to login (no loop)", async ({ page, context, baseURL }) => {
    await login(page, user);
    const auth = (await context.cookies()).filter((c) => /^sb-.*-auth-token/.test(c.name));
    // Leave the app first: an open app page reacts to the cookie change by redirecting itself.
    await page.goto("/legal/terms");
    await context.clearCookies();
    const expired = Buffer.from(
      JSON.stringify({ access_token: "x.y.z", refresh_token: "revoked-token", expires_at: 1, expires_in: 0, token_type: "bearer", user: { id: user.id } }),
    ).toString("base64url");
    await context.addCookies([{ name: auth[0].name.replace(/\.\d+$/, ""), value: `base64-${expired}`, url: baseURL! }]);
    const navigations: string[] = [];
    page.on("framenavigated", (f) => {
      if (f === page.mainFrame()) navigations.push(f.url());
    });
    await page.goto("/chats");
    await expect(page).toHaveURL(/\/login\?next=%2Fchats/);
    // No loop: the page settles on /login instead of bouncing between pages.
    await page.waitForTimeout(3000);
    await expect(page).toHaveURL(/\/login\?next=%2Fchats/);
    expect(navigations.length).toBeLessThan(4);
  });

  test("suspended accounts are shown the suspension page", async ({ page }) => {
    const suspended = await createUser();
    try {
      await admin().from("profiles").update({ status: "suspended" }).eq("id", suspended.id);
      await login(page, suspended);
      await expect(page).toHaveURL(/\/suspended/);
    } finally {
      await deleteUsers(suspended);
    }
  });

  test("deleting the account server-side ends the session on next load", async ({ page }) => {
    const gone = await createUser();
    await login(page, gone);
    await deleteUsers(gone);
    await page.goto("/settings");
    // The access token may still verify until it expires, but the app must not render a profile.
    await expect(page.getByText(`@${gone.username}`)).toHaveCount(0);
  });
});
