import { test } from "@playwright/test";
import { canCreateUsers, createUser, deleteUsers, expect, login, logoutViaUi, NEEDS_USERS, sessionFromCookies, type TestUser } from "../support/fixtures";

test.describe("logout", () => {
  test.skip(!canCreateUsers, NEEDS_USERS);
  let user: TestUser;
  test.beforeAll(async () => {
    user = await createUser();
  });
  test.afterAll(async () => deleteUsers(user));

  test("clears the session cookies and protects the app afterwards", async ({ page, context }) => {
    await login(page, user);
    expect(await sessionFromCookies(context)).not.toBeNull();
    await logoutViaUi(page);
    expect(await sessionFromCookies(context)).toBeNull();
    await page.goto("/home");
    await expect(page).toHaveURL(/\/login/);
  });

  test("revokes the refresh token server-side", async ({ page, context, request }) => {
    await login(page, user);
    const session = await sessionFromCookies(context);
    expect(session?.refresh_token).toBeTruthy();
    await logoutViaUi(page);
    const res = await request.post(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! },
      data: { refresh_token: session!.refresh_token },
    });
    expect(res.status()).toBeGreaterThanOrEqual(400);
  });

  test("Back after logout does not show the signed-in app", async ({ page }) => {
    await login(page, user);
    await page.goto("/profile");
    await expect(page.getByText(`@${user.username}`).filter({ visible: true }).first()).toBeVisible();
    await logoutViaUi(page);
    await page.goBack();
    // What's on screen matters: the sign-in form, not the old session. (Playwright's Windows
    // WebKit can keep the pre-redirect URL in the address bar after a history navigation.)
    await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(`@${user.username}`)).toHaveCount(0);
  });

  test("signing out one device keeps other devices signed in", async ({ browser }) => {
    const phone = await browser.newContext();
    const laptop = await browser.newContext();
    const a = await phone.newPage();
    const b = await laptop.newPage();
    await login(a, user);
    await login(b, user);
    await logoutViaUi(a);
    await b.goto("/profile");
    await expect(b).toHaveURL(/\/profile/);
    await expect(b.getByText(`@${user.username}`).filter({ visible: true }).first()).toBeVisible();
    await phone.close();
    await laptop.close();
  });

  test("other tabs of the same browser follow the sign-out", async ({ context }) => {
    const tab1 = await context.newPage();
    await login(tab1, user);
    const tab2 = await context.newPage();
    await tab2.goto("/home");
    await expect(tab2).toHaveURL(/\/home/);
    await logoutViaUi(tab1);
    await expect(tab2).toHaveURL(/\/login/, { timeout: 15_000 });
  });

  test("repeated login and logout works every time", async ({ page }) => {
    for (let i = 0; i < 3; i += 1) {
      await login(page, user);
      await expect(page).toHaveURL(/\/home/);
      await logoutViaUi(page);
      await expect(page).toHaveURL(/\/login/);
    }
  });
});
